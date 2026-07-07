import os
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent
INSTALLER = REPO_ROOT / "install.sh"


def _write_stub_commands(tmp_path, hostname_value="dev-pc", ssd_mounted=True):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()

    git_stub = bin_dir / "git"
    git_stub.write_text(
        "#!/bin/sh\n"
        "printf '%s\\n' \"$*\" >> \"$INSTALL_TEST_LOG\"\n"
        "for dest do :; done\n"
        "mkdir -p \"$dest/docker\"\n"
        "cat > \"$dest/docker/container.sh\" <<'EOS'\n"
        "#!/bin/sh\n"
        "printf '%s\\n' \"container.sh $*\" >> \"$INSTALL_TEST_LOG\"\n"
        "EOS\n"
        "chmod +x \"$dest/docker/container.sh\"\n",
    )
    git_stub.chmod(0o755)

    hostname_stub = bin_dir / "hostname"
    hostname_stub.write_text(
        "#!/bin/sh\n"
        f"printf '%s\\n' '{hostname_value}'\n",
    )
    hostname_stub.chmod(0o755)

    mountpoint_stub = bin_dir / "mountpoint"
    mountpoint_stub.write_text(
        "#!/bin/sh\n"
        "printf '%s\\n' \"mountpoint $*\" >> \"$INSTALL_TEST_LOG\"\n"
        "if [ \"$1\" = -q ] && [ \"$2\" = \"$CYCLO_INSTALL_SSD_ROOT\" ]; then\n"
        f"  exit {0 if ssd_mounted else 1}\n"
        "fi\n"
        "exit 1\n",
    )
    mountpoint_stub.chmod(0o755)

    return bin_dir


def _run_install(tmp_path, args=None, hostname_value="dev-pc", ssd_mounted=True):
    args = args or []
    home = tmp_path / "home"
    home.mkdir()
    ssd = tmp_path / "ssd"
    ssd.mkdir()
    log_path = tmp_path / "install.log"
    bin_dir = _write_stub_commands(tmp_path, hostname_value, ssd_mounted)
    env = {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "HOME": str(home),
        "INSTALL_TEST_LOG": str(log_path),
        "CYCLO_INSTALL_REPO_URL": "https://example.invalid/cyclo.git",
        "CYCLO_INSTALL_SSD_ROOT": str(ssd),
    }

    result = subprocess.run(
        ["bash", str(INSTALLER), *args],
        check=False,
        env=env,
        text=True,
        capture_output=True,
    )
    return result, home, ssd, log_path


def test_local_mode_installs_under_home_and_prints_start_command(tmp_path):
    result, home, _ssd, log_path = _run_install(tmp_path, ["--local"])

    assert result.returncode == 0, result.stderr
    assert (home / "cyclo_intelligence").is_dir()
    assert "clone --recurse-submodules --branch main" in log_path.read_text()
    assert "mountpoint " not in log_path.read_text()
    assert "container.sh start" not in log_path.read_text()
    assert "./docker/container.sh start" in result.stdout


def test_auto_robot_hostname_installs_on_ssd_symlinks_home_and_does_not_start(tmp_path):
    result, home, ssd, log_path = _run_install(
        tmp_path,
        hostname_value="ffw-SNPR48A1106",
    )

    assert result.returncode == 0, result.stderr
    install_dir = ssd / "cyclo_intelligence"
    home_link = home / "cyclo_intelligence"
    assert install_dir.is_dir()
    assert home_link.is_symlink()
    assert home_link.resolve() == install_dir
    assert "container.sh start" not in log_path.read_text()
    assert "./docker/container.sh start" in result.stdout


def test_robot_mode_requires_mounted_ssd(tmp_path):
    result, home, ssd, _log_path = _run_install(
        tmp_path,
        ["--robot"],
        ssd_mounted=False,
    )

    assert result.returncode != 0
    assert "requires mounted SSD" in result.stderr
    assert not (ssd / "cyclo_intelligence").exists()
    assert not (home / "cyclo_intelligence").exists()


def test_robot_mode_uses_sudo_when_ssd_parent_is_not_writable(tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    ssd = tmp_path / "ssd"
    ssd.mkdir()
    log_path = tmp_path / "install.log"
    bin_dir = _write_stub_commands(
        tmp_path,
        hostname_value="ffw-SNPR48A1106",
    )
    install_dir = ssd / "cyclo_intelligence"

    mkdir_stub = bin_dir / "mkdir"
    mkdir_stub.write_text(
        "#!/bin/sh\n"
        "if [ \"$1\" = -p ] && [ \"$2\" = \"$CYCLO_INSTALL_SSD_ROOT/cyclo_intelligence\" ]; then\n"
        "  printf '%s\\n' \"mkdir direct denied $*\" >> \"$INSTALL_TEST_LOG\"\n"
        "  exit 1\n"
        "fi\n"
        "exec /bin/mkdir \"$@\"\n",
    )
    mkdir_stub.chmod(0o755)

    sudo_stub = bin_dir / "sudo"
    sudo_stub.write_text(
        "#!/bin/sh\n"
        "printf '%s\\n' \"sudo $*\" >> \"$INSTALL_TEST_LOG\"\n"
        "if [ \"$1\" = mkdir ]; then\n"
        "  shift\n"
        "  exec /bin/mkdir \"$@\"\n"
        "fi\n"
        "if [ \"$1\" = chown ]; then\n"
        "  exit 0\n"
        "fi\n"
        "exit 1\n",
    )
    sudo_stub.chmod(0o755)

    env = {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "HOME": str(home),
        "INSTALL_TEST_LOG": str(log_path),
        "CYCLO_INSTALL_REPO_URL": "https://example.invalid/cyclo.git",
        "CYCLO_INSTALL_SSD_ROOT": str(ssd),
    }

    result = subprocess.run(
        ["bash", str(INSTALLER)],
        check=False,
        env=env,
        text=True,
        capture_output=True,
    )

    assert result.returncode == 0, result.stderr
    assert install_dir.is_dir()
    assert (home / "cyclo_intelligence").resolve() == install_dir
    log = log_path.read_text()
    assert "mkdir direct denied -p" in log
    assert "sudo mkdir -p" in log
    assert "sudo chown" in log
    assert "clone --recurse-submodules --branch main" in log


def test_existing_home_path_safely_stops(tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    (home / "cyclo_intelligence").mkdir()
    ssd = tmp_path / "ssd"
    ssd.mkdir()
    log_path = tmp_path / "install.log"
    bin_dir = _write_stub_commands(tmp_path)
    env = {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "HOME": str(home),
        "INSTALL_TEST_LOG": str(log_path),
        "CYCLO_INSTALL_REPO_URL": "https://example.invalid/cyclo.git",
        "CYCLO_INSTALL_SSD_ROOT": str(ssd),
    }

    result = subprocess.run(
        ["bash", str(INSTALLER), "--local"],
        check=False,
        env=env,
        text=True,
        capture_output=True,
    )

    assert result.returncode != 0
    assert "already exists" in result.stderr
    assert not log_path.exists()


def test_ref_option_is_passed_to_git_clone(tmp_path):
    result, _home, _ssd, log_path = _run_install(
        tmp_path,
        ["--local", "--ref", "v9.9.9"],
    )

    assert result.returncode == 0, result.stderr
    assert "clone --recurse-submodules --branch v9.9.9" in log_path.read_text()
