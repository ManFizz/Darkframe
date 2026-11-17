// A tiny stand-in for the WD tagger (same input / output contract), written as raw
// ONNX protobuf so the tests need neither the 380 MB model nor python tooling.
// Minimal ONNX writer: output = Sigmoid(MatMul(ReduceMean(input[1,448,448,3], axes=[1,2]), W[3,N]))
const fs = require('fs');
const varint = (n) => { const b = []; n = BigInt(n); while (n > 127n) { b.push(Number(n & 127n) | 128); n >>= 7n; } b.push(Number(n)); return Buffer.from(b); };
const key = (f, t) => varint((f << 3) | t);
const vint = (f, n) => Buffer.concat([key(f, 0), varint(n)]);
const bytes = (f, buf) => Buffer.concat([key(f, 2), varint(buf.length), buf]);
const str = (f, s) => bytes(f, Buffer.from(s));
const cat = (...a) => Buffer.concat(a);
const dim = (v) => typeof v === 'string' ? bytes(1, str(2, v)) : bytes(1, vint(1, v));
const valueInfo = (name, dims) => cat(str(1, name), bytes(2, bytes(1, cat(vint(1, 1), bytes(2, cat(...dims.map(dim)))))));
const N = 7;
// columns: tags; rows: B,G,R channel means (BGR input, 0..255). Tag 4 fires on red, 5 on green, 6 on blue; ratings 0..3 weak.
const W = [];
for (let c = 0; c < 3; c++) for (let t = 0; t < N; t++) {
  let w = -0.01;
  if (t === 0) w = 0.02;                  // "general" rating: always highish
  if (t === 4 && c === 2) w = 0.06;       // red channel → red_theme
  if (t === 5 && c === 1) w = 0.06;       // green → green_theme
  if (t === 6 && c === 0) w = 0.06;       // blue → blue_theme
  W.push(w);
}
const fl = Buffer.alloc(W.length * 4); W.forEach((v, i) => fl.writeFloatLE(v, i * 4));
const bias = [-4, -4, -4, -4, -6, -6, -6];
const bl = Buffer.alloc(N * 4); bias.forEach((v, i) => bl.writeFloatLE(v, i * 4));
const tensor = (name, dims, raw) => cat(...dims.map(d => vint(1, d)), vint(2, 1), str(8, name), bytes(9, raw));
const attrInts = (name, ints) => cat(str(1, name), ...ints.map(i => vint(8, i)), vint(20, 7));
const attrInt = (name, i) => cat(str(1, name), vint(3, i), vint(20, 2));
const node = (ins, outs, op, attrs = []) => cat(...ins.map(i => str(1, i)), ...outs.map(o => str(2, o)), str(4, op), ...attrs.map(a => bytes(5, a)));
const graph = cat(
  bytes(1, node(['input_1:0'], ['m'], 'ReduceMean', [attrInts('axes', [1, 2]), attrInt('keepdims', 0)])),
  bytes(1, node(['m', 'W'], ['z0'], 'MatMul')),
  bytes(1, node(['z0', 'b'], ['z'], 'Add')),
  bytes(1, node(['z'], ['predictions_sigmoid'], 'Sigmoid')),
  str(2, 'tiny_tagger'),
  bytes(5, tensor('W', [3, N], fl)),
  bytes(5, tensor('b', [N], bl)),
  bytes(11, valueInfo('input_1:0', ['batch', 448, 448, 3])),
  bytes(12, valueInfo('predictions_sigmoid', ['batch', N])),
);
const model = cat(vint(1, 8), str(2, 'darkframe-test'), bytes(7, graph), bytes(8, cat(str(1, ''), vint(2, 13))));
function writeTinyTagger(dir) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(dir + '/model.onnx', model);
    fs.writeFileSync(dir + '/selected_tags.csv',
        'tag_id,name,category,count\n1,general,9,1\n2,sensitive,9,1\n3,questionable,9,1\n4,explicit,9,1\n5,red_theme,0,1\n6,green_theme,0,1\n7,blue_theme,4,1\n');
}
module.exports = { writeTinyTagger };
