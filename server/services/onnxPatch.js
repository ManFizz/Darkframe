/**
 * Expose an inner tensor of an ONNX model as an extra graph output, so a session
 * returns it alongside the model's own outputs. Works on the raw protobuf bytes —
 * no onnx library needed: ModelProto.graph (field 7) gets one more
 * GraphProto.output (field 12) = ValueInfoProto { name, type: float tensor }.
 * The weights are copied as they are; only the length prefix of the graph changes.
 */

function readVarint(b, p) {
    let r = 0, s = 1, x;
    do { x = b[p++]; r += (x & 0x7f) * s; s *= 128; } while (x & 0x80);
    return [r, p];
}

function varint(n) {
    const out = [];
    do { let x = n % 128; n = Math.floor(n / 128); if (n) x |= 0x80; out.push(x); } while (n);
    return Buffer.from(out);
}

const lenField = (field, payload) => Buffer.concat([varint((field << 3) | 2), varint(payload.length), payload]);

function addOutput(model, name) {
    let p = 0;
    while (p < model.length) {
        const start = p;
        let key; [key, p] = readVarint(model, p);
        const field = key >> 3, wire = key & 7;
        if (wire === 0) { [, p] = readVarint(model, p); continue; }
        if (wire === 1) { p += 8; continue; }
        if (wire === 5) { p += 4; continue; }
        if (wire !== 2) throw new Error(`unexpected wire type ${wire}`);
        let len; [len, p] = readVarint(model, p);
        if (field === 7) {
            const output = Buffer.concat([
                lenField(1, Buffer.from(name, 'utf8')),
                lenField(2, lenField(1, Buffer.from([0x08, 0x01]))),   // TypeProto{tensor_type{elem_type: FLOAT}}
            ]);
            const graph = Buffer.concat([model.subarray(p, p + len), lenField(12, output)]);
            return Buffer.concat([model.subarray(0, start), lenField(7, graph), model.subarray(p + len)]);
        }
        p += len;
    }
    throw new Error('no graph in the model');
}

module.exports = { addOutput };
