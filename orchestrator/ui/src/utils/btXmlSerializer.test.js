import { serializeFromGraph } from './btXmlSerializer';
import { parseBTXml } from './btTreeParser';

function sampleGraph() {
  const nodes = [
    {
      id: 'bt_0',
      type: 'btControl',
      position: { x: 10, y: 20 },
      data: {
        label: 'Sequence_1',
        nodeType: 'Sequence',
        params: {},
        collapsed: false,
      },
    },
    {
      id: 'bt_1',
      type: 'btAction',
      position: { x: 30, y: 40 },
      data: {
        label: 'Wait_1',
        nodeType: 'Wait',
        params: { duration: '3.0' },
      },
    },
  ];
  const edges = [
    { id: 'e_bt_0_bt_1', source: 'bt_0', target: 'bt_1' },
  ];
  const nodeDataMap = new Map([
    ['bt_0', { tag: 'Sequence', name: 'Sequence_1', params: {}, collapsed: false }],
    ['bt_1', { tag: 'Wait', name: 'Wait_1', params: { duration: '3.0' } }],
  ]);
  return { nodes, edges, nodeDataMap };
}

describe('btXmlSerializer', () => {
  it('serializes graph nodes and layout attributes', () => {
    const { nodes, edges, nodeDataMap } = sampleGraph();
    const xml = serializeFromGraph(nodes, edges, nodeDataMap);

    expect(xml).toContain('<BehaviorTree ID="MainTree">');
    expect(xml).toContain('<Sequence name="Sequence_1"');
    expect(xml).toContain('<Wait name="Wait_1"');
    expect(xml).toContain('duration="3.0"');
    expect(xml).toContain('bt_x="10"');
  });

  it('round-trips serialized graphs through the parser', () => {
    const { nodes, edges, nodeDataMap } = sampleGraph();
    const xml = serializeFromGraph(nodes, edges, nodeDataMap);
    const parsed = parseBTXml(xml);

    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.edges).toHaveLength(1);
    expect([...parsed.nodeDataMap.values()].map((entry) => entry.tag)).toEqual([
      'Sequence',
      'Wait',
    ]);
  });
});
