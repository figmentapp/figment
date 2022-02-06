import Session from './Session';
import Network from './Network';

const testSources = {};

testSources.value = `// Return a value.
const numberIn = node.numberIn('v');
const numberOut = node.numberOut('out');
function render() {
  numberOut.value = numberIn.value;
}
numberIn.onChange = render;
`;

testSources.negate = `// Negate a number.
const numberIn = node.numberIn('v');
const numberOut = node.numberOut('out');
function render() {
  numberOut.value = -numberIn.value;
}
numberIn.onChange = render;
`;

testSources.add = `// Add two numbers.
const number1In = node.numberIn('v1');
const number2In = node.numberIn('v2');
const numberOut = node.numberOut('out');
function render() {
  numberOut.value = number1In.value + number2In.value;
}
number1In.onChange = render;
number2In.onChange = render;
`;

class TestLibrary {
  constructor() {
    this.nodeTypes = [];
    this.nodeTypes.push({ name: 'Value', type: 'test.value', source: testSources.value });
    this.nodeTypes.push({ name: 'Negate', type: 'test.negate', source: testSources.negate });
    this.nodeTypes.push({ name: 'Add', type: 'test.add', source: testSources.add });
  }

  findByType(type) {
    return this.nodeTypes.find((node) => node.type === type);
  }
}

test('empty dependency graph', () => {
  console.log('hellwe');
  const net = new Network();
  const session = new Session(net);

  session.run();
  expect(session.dag).toEqual([]);
});

test('simple network graph', () => {
  const net = new Network(new TestLibrary());
  const value1 = net.createNode('test.value', 0, 0);
  value1.set('v', 42);
  const negate1 = net.createNode('test.negate', 0, 0);
  net.connect(value1.findOutPort('out'), negate1.findInPort('v'));

  const session = new Session(net);
  const dag = session.buildDependencyGraph();
  expect(dag).toEqual([value1.id, negate1.id]);
});

test('simple diamond graph', () => {
  const net = new Network(new TestLibrary());
  const value1 = net.createNode('test.value', 0, 0);
  value1.set('v', 42);
  const add1 = net.createNode('test.add', 0, 0);
  net.connect(value1.findOutPort('out'), add1.findInPort('v1'));
  net.connect(value1.findOutPort('out'), add1.findInPort('v2'));

  const session = new Session(net);
  const dag = session.buildDependencyGraph();
  expect(dag).toEqual([value1.id, add1.id]);
});

test('independent roots graph', () => {
  const net = new Network(new TestLibrary());
  const value1 = net.createNode('test.value', 0, 0);
  const negate1 = net.createNode('test.negate', 0, 0);
  const value2 = net.createNode('test.value', 0, 0);
  const negate2 = net.createNode('test.negate', 0, 0);
  net.connect(value1.findOutPort('out'), negate1.findInPort('v'));
  net.connect(value2.findOutPort('out'), negate2.findInPort('v'));

  const session = new Session(net);
  const dag = session.buildDependencyGraph();
  expect(dag).toEqual([value1.id, negate1.id, value2.id, negate2.id]);
});

test('run graph', () => {
  const net = new Network(new TestLibrary());
  const value1 = net.createNode('test.value', 0, 0);
  value1.set('v', 3);
  const value2 = net.createNode('test.value', 0, 0);
  value2.set('v', 5);
  const add1 = net.createNode('test.add', 0, 0);
  const negate1 = net.createNode('test.negate', 0, 0);
  net.connect(value1.findOutPort('out'), add1.findInPort('v1'));
  net.connect(value2.findOutPort('out'), add1.findInPort('v2'));
  net.connect(add1.findOutPort('out'), negate1.findInPort('v'));

  const session = new Session(net);
  const dag = session.buildDependencyGraph();
  expect(dag).toEqual([value1.id, value2.id, add1.id, negate1.id]);
  session.run();
  expect(negate1.findOutPort('out').value).toEqual(-8);
});
