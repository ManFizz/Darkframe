const test = require('node:test');
const assert = require('node:assert/strict');
const {
    colorFactors, isNeutralColor, normalizeEditParams, cssFilter, applyColorToRaw, NEUTRAL_COLOR,
} = require('../src/js/shared/imageAdjust');

test('neutral colour is a no-op everywhere', () => {
    assert.ok(isNeutralColor(NEUTRAL_COLOR));
    assert.ok(isNeutralColor(null));
    assert.equal(cssFilter(NEUTRAL_COLOR), 'none');
    const px = Uint8Array.from([10, 128, 250, 255]);
    assert.deepEqual([...applyColorToRaw(px.slice(), 4, NEUTRAL_COLOR)], [...px]);
});

test('slider to factor mapping and clamping', () => {
    assert.deepEqual(
        colorFactors({ brightness: 50, contrast: -50, saturation: 100, gamma: 50 }),
        { b: 1.5, c: 0.5, s: 2, g: 2 },
    );
    assert.equal(colorFactors({ brightness: 500 }).b, 2);
    assert.equal(colorFactors({ gamma: -100 }).g, 0.25);
});

test('cssFilter lists only active parts, gamma only with a filter url', () => {
    assert.equal(cssFilter({ brightness: 20 }), 'brightness(1.2)');
    assert.equal(cssFilter({ gamma: 50 }), 'none');
    assert.equal(cssFilter({ contrast: 10, gamma: 50 }, '#g'), 'contrast(1.1) url(#g)');
});

test('normalizeEditParams fills defaults and clamps output', () => {
    const p = normalizeEditParams({ angle: '90', crop: { x: -1, w: 3 }, output: { format: 'bmp', quality: 5, maxSide: 3 } });
    assert.equal(p.angle, 90);
    assert.deepEqual(p.crop, { x: 0, y: 0, w: 1, h: 1 });
    assert.deepEqual(p.output, { format: 'keep', quality: 30, maxSide: 16 });
    assert.deepEqual(p.color, NEUTRAL_COLOR);
});

test('pixel math: brightness, contrast, desaturation; alpha untouched', () => {
    const rgba = Uint8Array.from([100, 100, 100, 77]);
    applyColorToRaw(rgba, 4, { brightness: 100 });
    assert.deepEqual([...rgba], [200, 200, 200, 77]);

    const mid = Uint8Array.from([64, 128, 192]);
    applyColorToRaw(mid, 3, { contrast: 100 });          // pushes values away from the middle
    assert.ok(mid[0] < 64 && mid[2] > 192);

    const red = Uint8Array.from([255, 0, 0]);
    applyColorToRaw(red, 3, { saturation: -100 });       // fully grey
    assert.equal(red[0], red[1]);
    assert.equal(red[1], red[2]);
});
