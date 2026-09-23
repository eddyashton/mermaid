import { test, expect } from '@playwright/test';
import sharp from 'sharp';

import { imgSnapshotTest, renderGraph } from '../../helpers/util.ts';

test.describe('radar structure', () => {
  test('should render a complex radar diagram', async ({ page }, testInfo) => {
    await imgSnapshotTest(
      page,
      testInfo,
      `radar-beta
                title My favorite ninjas
                axis Agility, Speed, Strength
                axis Stam["Stamina"] , Intel["Intelligence"]

                curve Ninja1["Naruto Uzumaki"]{
                    Agility 2, Speed 2,
                    Strength 3, Stam 5,
                    Intel 0
                }
                curve Ninja2["Sasuke"]{2, 3, 4, 1, 5}
                curve Ninja3 {3, 2, 1, 5, 4}

                showLegend true
                ticks 3
                max 8
                min 0
                graticule polygon
            `
    );
    await expect(page.locator('svg')).toHaveCount(1);
  });

  const renderBand = async (page, testInfo, axes, entries, graticule = 'circle') => {
    await renderGraph(
      page,
      testInfo,
      `radar-beta
      axis ${axes}
      curve c1{${entries}}
      max 10
      graticule ${graticule}`,
      {
        screenshot: false,
        theme: 'base',
        themeVariables: {
          cScale0: '#ff0000',
          radar: {
            curveOpacity: 1,
            curveStrokeWidth: 0,
            axisStrokeWidth: 0,
            graticuleOpacity: 0,
            graticuleStrokeWidth: 0,
          },
        },
      }
    );
  };

  const pixelAt = async (page, x, y) => {
    const position = await page
      .locator('.radarAxisLine')
      .first()
      .evaluate(
        (axis, [x, y]) => {
          const point = new DOMPoint(x, y).matrixTransform(axis.getScreenCTM());
          return { x: Math.floor(point.x), y: Math.floor(point.y) };
        },
        [x, y]
      );
    const screenshot = await page.screenshot({
      clip: { ...position, width: 1, height: 1 },
      scale: 'css',
    });
    const pixel = await sharp(screenshot).removeAlpha().raw().toBuffer();
    return [...pixel];
  };

  test('should preserve literal fill when equivalent range syntax is used', async ({
    page,
  }, testInfo) => {
    for (const entries of [
      '0,0,1,10,0,0,10',
      '[0..0],0,1,10,0,0,10',
      '[0..0],[0..0],[0..1],[0..10],[0..0],[0..0],[0..10]',
    ]) {
      await renderBand(page, testInfo, 'A,B,C,D,E,F,G', entries);
      expect(await pixelAt(page, 6, 0)).toEqual([255, 0, 0]);
    }
  });

  test('should not fill outside the upper envelope when smoothed boundaries cross', async ({
    page,
  }, testInfo) => {
    await renderBand(
      page,
      testInfo,
      'A,B,C,D,E,F,G,H',
      '[5..5.1],[5..5.1],[5..5.1],[5..5.1],[5..5.1],[5..5.1],[5..5.1],[5..10]'
    );
    expect(await pixelAt(page, 34.5, -144)).toEqual([255, 255, 255]);
    expect(await pixelAt(page, -180, -180)).toEqual([255, 0, 0]);
  });

  for (const graticule of ['circle', 'polygon']) {
    test(`should paint separate ${graticule} lobes without filling missing axes`, async ({
      page,
    }, testInfo) => {
      await renderBand(
        page,
        testInfo,
        'A,B,C,D,E,F,G,H',
        '[4..8],[4..8],null,[4..8],[4..8],null,[4..8],[4..8]',
        graticule
      );
      expect(await pixelAt(page, 60, -150)).toEqual([255, 0, 0]);
      expect(await pixelAt(page, -60, -150)).toEqual([255, 0, 0]);
      expect(await pixelAt(page, 60, 150)).toEqual([255, 0, 0]);
      expect(await pixelAt(page, 150, 0)).toEqual([255, 255, 255]);
      expect(await pixelAt(page, -110, 110)).toEqual([255, 255, 255]);
      expect(await pixelAt(page, 10, -10)).toEqual([255, 255, 255]);
      // Beyond the observed B and G axes, but before their missing neighbours.
      expect(await pixelAt(page, 155, -100)).toEqual(
        graticule === 'circle' ? [255, 0, 0] : [255, 255, 255]
      );
      expect(await pixelAt(page, -180, 35)).toEqual(
        graticule === 'circle' ? [255, 0, 0] : [255, 255, 255]
      );

      await renderBand(
        page,
        testInfo,
        'A,B,C,D,E,F,G,H',
        'null,[2..8],[2..8],[2..8],[2..8],[2..8],[2..8],[2..8]',
        graticule
      );
      expect(await pixelAt(page, 0, -150)).toEqual([255, 255, 255]);
      expect(await pixelAt(page, 0, 150)).toEqual([255, 0, 0]);
      expect(await pixelAt(page, 150, 0)).toEqual([255, 0, 0]);
      expect(await pixelAt(page, -150, 0)).toEqual([255, 0, 0]);
    });
  }

  test('should keep smoothed run overshoot out of missing sectors', async ({ page }, testInfo) => {
    await renderBand(page, testInfo, 'A,B,C,D,E,F,G,H', 'null,0,0.1,10,8,null,null,null');
    expect(await pixelAt(page, -8, -10)).toEqual([255, 255, 255]);
    expect(await pixelAt(page, 60, 180)).toEqual([255, 0, 0]);
  });

  test('should round both sides of an isolated interval without filling missing axes', async ({
    page,
  }, testInfo) => {
    await renderBand(
      page,
      testInfo,
      'A,B,C,D,E,F,G,H',
      '[4..8],null,null,null,null,null,null,null'
    );
    expect(await pixelAt(page, 0, -180)).toEqual([255, 0, 0]);
    expect(await pixelAt(page, -35, -180)).toEqual([255, 0, 0]);
    expect(await pixelAt(page, 35, -180)).toEqual([255, 0, 0]);
    expect(await pixelAt(page, 130, -130)).toEqual([255, 255, 255]);
    expect(await pixelAt(page, -130, -130)).toEqual([255, 255, 255]);
  });

  test('should not paint phantom rays from rounded tips to the centre', async ({
    page,
  }, testInfo) => {
    await renderBand(
      page,
      testInfo,
      'A,B,C,D,E,F,G,H',
      '[4..8],[4..8],null,[4..8],[4..8],null,[4..8],[4..8]'
    );
    for (const angle of [-Math.PI / 8, Math.PI / 8, (5 * Math.PI) / 8, (7 * Math.PI) / 8]) {
      expect(await pixelAt(page, 90 * Math.cos(angle), 90 * Math.sin(angle))).toEqual([
        255, 255, 255,
      ]);
    }
  });
});
