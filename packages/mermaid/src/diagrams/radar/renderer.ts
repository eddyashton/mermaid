import type { Diagram } from '../../Diagram.js';
import type { RadarDiagramConfig } from '../../config.type.js';
import type { DiagramRenderer, DrawDefinition, SVG, SVGGroup } from '../../diagram-api/types.js';
import { selectSvgElement } from '../../rendering-util/selectSvgElement.js';
import { configureSvgSize } from '../../setupGraphViewbox.js';
import type { RadarDB, RadarAxis, RadarCurve } from './types.js';

interface Point {
  x: number;
  y: number;
}

interface BandPoint {
  axis: number;
  outer: Point;
  inner: Point;
}

const draw: DrawDefinition = (_text, id, _version, diagram: Diagram) => {
  const db = diagram.db as RadarDB;
  const axes = db.getAxes();
  const curves = db.getCurves();
  const options = db.getOptions();
  const config = db.getConfig();
  const title = db.getDiagramTitle();

  const svg: SVG = selectSvgElement(id);

  // 🖼️ Draw the main frame
  const g = drawFrame(svg, config);

  // The maximum value for the radar chart is the 'max' option if it exists,
  // otherwise it is the maximum value of the curves
  const values = curves.flatMap((curve) => curve.entries).filter((entry) => entry !== null);
  if (
    options.max === null &&
    values.length === 0 &&
    curves.some((curve) => curve.entries.includes(null))
  ) {
    throw new Error('Radar diagrams with only missing values require an explicit max');
  }
  const maxValue: number = options.max ?? Math.max(...values);
  const minValue: number = options.min;
  const radius = Math.min(config.width, config.height) / 2;

  // 🕸️ Draw graticule
  drawGraticule(g, axes, radius, options.ticks, options.graticule);

  // 🪓 Draw the axes
  drawAxes(g, axes, radius, config);

  // 📊 Draw the curves
  drawCurves(g, axes, curves, minValue, maxValue, options.graticule, config, id);

  // 🏷 Draw Legend
  drawLegend(g, curves, options.showLegend, config);

  // 🏷 Draw Title
  g.append('text')
    .attr('class', 'radarTitle')
    .text(title)
    .attr('x', 0)
    .attr('y', -config.height / 2 - config.marginTop);
};

// Returns a g element to center the radar chart
// it is of type SVGElement
const drawFrame = (svg: SVG, config: Required<RadarDiagramConfig>): SVGGroup => {
  const totalWidth = config.width + config.marginLeft + config.marginRight;
  const totalHeight = config.height + config.marginTop + config.marginBottom;
  const center = {
    x: config.marginLeft + config.width / 2,
    y: config.marginTop + config.height / 2,
  };
  configureSvgSize(svg, totalHeight, totalWidth, config.useMaxWidth ?? true);

  svg.attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`).attr('overflow', 'visible');
  // g element to center the radar chart
  return svg.append('g').attr('transform', `translate(${center.x}, ${center.y})`);
};

const drawGraticule = (
  g: SVGGroup,
  axes: RadarAxis[],
  radius: number,
  ticks: number,
  graticule: string
) => {
  if (graticule === 'circle') {
    // Draw a circle for each tick
    for (let i = 0; i < ticks; i++) {
      const r = (radius * (i + 1)) / ticks;
      g.append('circle').attr('r', r).attr('class', 'radarGraticule');
    }
  } else if (graticule === 'polygon') {
    // Draw a polygon
    const numAxes = axes.length;
    for (let i = 0; i < ticks; i++) {
      const r = (radius * (i + 1)) / ticks;
      const points = axes
        .map((_, j) => {
          const angle = (2 * j * Math.PI) / numAxes - Math.PI / 2;
          const x = r * Math.cos(angle);
          const y = r * Math.sin(angle);
          return `${x},${y}`;
        })
        .join(' ');
      g.append('polygon').attr('points', points).attr('class', 'radarGraticule');
    }
  }
};

const drawAxes = (
  g: SVGGroup,
  axes: RadarAxis[],
  radius: number,
  config: Required<RadarDiagramConfig>
) => {
  const numAxes = axes.length;

  for (let i = 0; i < numAxes; i++) {
    const label = axes[i].label;
    const angle = (2 * i * Math.PI) / numAxes - Math.PI / 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    g.append('line')
      .attr('x1', 0)
      .attr('y1', 0)
      .attr('x2', radius * config.axisScaleFactor * cosA)
      .attr('y2', radius * config.axisScaleFactor * sinA)
      .attr('class', 'radarAxisLine');

    // Anchor labels based on their angular position so that text extends
    // away from the chart center rather than overflowing the viewBox.
    const textAnchor = cosA > 0.01 ? 'start' : cosA < -0.01 ? 'end' : 'middle';
    const dominantBaseline = sinA > 0.01 ? 'hanging' : sinA < -0.01 ? 'auto' : 'central';

    // Small pixel offset to push labels slightly outward from the axis endpoint,
    // giving extra clearance so text doesn't sit right at the chart boundary.
    const labelPad = 4;

    g.append('text')
      .text(label)
      .attr('x', radius * config.axisLabelFactor * cosA + labelPad * cosA)
      .attr('y', radius * config.axisLabelFactor * sinA + labelPad * sinA)
      .attr('text-anchor', textAnchor)
      .attr('dominant-baseline', dominantBaseline)
      .attr('class', 'radarAxisLabel');
  }
};

function drawCurves(
  g: SVGGroup,
  axes: RadarAxis[],
  curves: RadarCurve[],
  minValue: number,
  maxValue: number,
  graticule: string,
  config: Required<RadarDiagramConfig>,
  id: string
) {
  const numAxes = axes.length;
  const radius = Math.min(config.width, config.height) / 2;

  curves.forEach((curve, index) => {
    if (curve.entries.length !== numAxes) {
      // Skip curves that do not have an entry for each axis.
      return;
    }
    const pointAt = (entry: number, i: number): Point => {
      const angle = (2 * Math.PI * i) / numAxes - Math.PI / 2;
      const r = relativeRadius(entry, minValue, maxValue, radius);
      return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
    };
    const bandPoints = curve.entries.map((entry, i) =>
      entry === null
        ? null
        : {
            axis: i,
            outer: pointAt(entry, i),
            inner: pointAt(curve.startEntries?.[i] ?? minValue, i),
          }
    );
    if (bandPoints.includes(null)) {
      populatedRuns(bandPoints).forEach((run, runIndex) => {
        if (graticule === 'circle') {
          const { outerArc, innerArc, outline } = roundedRun(run, numAxes, config.curveTension);
          drawBand(
            g,
            `${outerArc} L0,0 Z`,
            `${innerArc} L0,0 Z`,
            index,
            `${id}-run-${runIndex}`,
            outerArc,
            innerArc,
            outline
          );
          return;
        }
        const outer = run.map((point) => point.outer);
        const inner = run.map((point) => point.inner);
        const outerArc = polygonCurve(outer);
        const innerArc = polygonCurve(inner);
        const first = run[0];
        const last = run[run.length - 1];
        if (run.length === 1) {
          g.append('path')
            .attr('d', `${outerArc} L${first.inner.x},${first.inner.y}`)
            .attr('class', `radarCurve-${index}`)
            .style('fill', 'none');
          return;
        }
        drawBand(
          g,
          `${outerArc} L0,0 Z`,
          `${innerArc} L0,0 Z`,
          index,
          `${id}-run-${runIndex}`,
          outerArc,
          innerArc,
          closedPolygonCurve([...outer, ...inner.toReversed()])
        );
        g.append('path')
          .attr(
            'd',
            `M${last.outer.x},${last.outer.y} L${last.inner.x},${last.inner.y} M${first.inner.x},${first.inner.y} L${first.outer.x},${first.outer.y}`
          )
          .attr('class', `radarCurveOutline-${index}`)
          .style('fill', 'none');
      });
      return;
    }
    const populated = bandPoints.filter((point) => point !== null);
    const points = populated.map((point) => point.outer);

    if (curve.startEntries !== undefined) {
      const startPoints = populated.map((point) => point.inner);
      const curvePath = graticule === 'circle' ? closedRoundCurve : closedPolygonCurve;
      const outerPath = curvePath(points, config.curveTension);
      const innerPath = curvePath(startPoints, config.curveTension);
      drawBand(g, outerPath, innerPath, index, id);
      return;
    }

    if (graticule === 'circle') {
      // Draw a closed curve through the points.
      g.append('path')
        .attr('d', closedRoundCurve(points, config.curveTension))
        .attr('class', `radarCurve-${index}`);
    } else if (graticule === 'polygon') {
      // Draw a polygon for each curve.
      g.append('polygon')
        .attr('points', points.map((p) => `${p.x},${p.y}`).join(' '))
        .attr('class', `radarCurve-${index}`);
    }
  });
}

function populatedRuns(points: (BandPoint | null)[]): BandPoint[][] {
  const gap = points.indexOf(null);
  const runs: BandPoint[][] = [];
  let run: BandPoint[] = [];
  // Start after a gap so the first/last chart axes belong to the same run.
  for (let offset = 1; offset <= points.length; offset++) {
    const point = points[(gap + offset) % points.length];
    if (point === null) {
      if (run.length > 0) {
        runs.push(run);
        run = [];
      }
    } else {
      run.push(point);
    }
  }
  return runs;
}

function roundedRun(run: BandPoint[], numAxes: number, tension: number) {
  const firstAxis = run[0].axis;
  const axes = [
    firstAxis - 0.5,
    ...run.map((_, index) => firstAxis + index),
    firstAxis + run.length - 0.5,
  ];
  const directions = axes.map((axis) => {
    const angle = (2 * Math.PI * axis) / numAxes - Math.PI / 2;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  });
  const tip = (point: BandPoint, direction: Point) => {
    const radius =
      (Math.hypot(point.outer.x, point.outer.y) + Math.hypot(point.inner.x, point.inner.y)) / 2;
    return {
      point: { x: radius * direction.x, y: radius * direction.y },
      handle: Math.min(
        Math.hypot(point.outer.x - point.inner.x, point.outer.y - point.inner.y) * tension,
        radius
      ),
    };
  };
  const start = tip(run[0], directions[0]);
  const end = tip(run[run.length - 1], directions[directions.length - 1]);
  const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
  const boundary = (side: 'outer' | 'inner') => {
    const points = [start.point, ...run.map((point) => point[side]), end.point];
    const tangents = points.map((point, index) => {
      if (index === 0 || index === points.length - 1) {
        // The two boundaries meet with opposite radial tangents at each rounded tip.
        const sign = (side === 'outer' ? 1 : -1) * (index === 0 ? 1 : -1);
        const handle = index === 0 ? start.handle : end.handle;
        return {
          x: directions[index].x * handle * sign,
          y: directions[index].y * handle * sign,
        };
      }
      const tangent = {
        x: (points[index + 1].x - points[index - 1].x) * tension,
        y: (points[index + 1].y - points[index - 1].y) * tension,
      };
      // Shorten both handles together to prevent overshoot across neighbouring rays
      // without cutting the rendered curve or breaking tangent continuity.
      const incoming = cross(directions[index - 1], tangent);
      const outgoing = cross(directions[index + 1], tangent);
      const scale = Math.min(
        1,
        incoming > 0 ? Math.max(0, cross(directions[index - 1], point)) / incoming : 1,
        outgoing > 0 ? Math.max(0, cross(point, directions[index + 1])) / outgoing : 1
      );
      return { x: tangent.x * scale, y: tangent.y * scale };
    });
    return { points, tangents };
  };
  const outer = boundary('outer');
  const inner = boundary('inner');
  return {
    outerArc: bezierCurve(outer.points, outer.tangents, false),
    innerArc: bezierCurve(inner.points, inner.tangents, false),
    outline: bezierCurve(
      [...outer.points, ...inner.points.slice(1, -1).toReversed()],
      [
        ...outer.tangents,
        ...inner.tangents
          .slice(1, -1)
          .toReversed()
          .map(({ x, y }) => ({ x: -x, y: -y })),
      ],
      true
    ),
  };
}

function drawBand(
  g: SVGGroup,
  outerPath: string,
  innerPath: string,
  index: number,
  id: string,
  outerOutline = outerPath,
  innerOutline = innerPath,
  fillPath = `${outerPath} ${innerPath}`
) {
  const maskId = `${id}-radar-mask-${index}`;
  const clipId = `${id}-radar-clip-${index}`;
  const defs = g.append('defs');
  const mask = defs.append('mask').attr('id', maskId).style('mask-type', 'luminance');

  // Smoothed boundaries can cross: subtract the inner region instead of XOR-filling it.
  mask
    .append('path')
    .attr('d', outerPath)
    .style('fill', 'white')
    .style('fill-opacity', 1)
    .style('stroke', 'none');
  mask
    .append('path')
    .attr('d', innerPath)
    .style('fill', 'black')
    .style('fill-opacity', 1)
    .style('stroke', 'none');
  defs.append('clipPath').attr('id', clipId).append('path').attr('d', outerPath);
  g.append('path')
    .attr('d', fillPath)
    .attr('fill-rule', 'nonzero')
    .attr('mask', `url(#${maskId})`)
    .attr('class', `radarCurve-${index}`)
    .style('stroke', 'none');
  g.append('path')
    .attr('d', outerOutline)
    .attr('class', `radarCurveOutline-${index}`)
    .style('fill', 'none');
  g.append('path')
    .attr('d', innerOutline)
    .attr('clip-path', `url(#${clipId})`)
    .attr('class', `radarCurveOutline-${index}`)
    .style('fill', 'none');
}

const polygonCurve = (points: Point[]): string =>
  points.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${x},${y}`).join(' ');

const closedPolygonCurve = (points: Point[]): string => `${polygonCurve(points)} Z`;

export function relativeRadius(
  value: number,
  minValue: number,
  maxValue: number,
  radius: number
): number {
  if (maxValue === minValue) {
    return 0;
  }
  const clippedValue = Math.min(Math.max(value, minValue), maxValue);
  return (radius * (clippedValue - minValue)) / (maxValue - minValue);
}

export function closedRoundCurve(points: Point[], tension: number): string {
  const tangents = points.map((_, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    return { x: (next.x - previous.x) * tension, y: (next.y - previous.y) * tension };
  });
  return bezierCurve(points, tangents, true);
}

function bezierCurve(points: Point[], tangents: Point[], closed: boolean): string {
  const numPoints = points.length;
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < (closed ? numPoints : numPoints - 1); i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % numPoints];
    const cp1 = {
      x: p1.x + tangents[i].x,
      y: p1.y + tangents[i].y,
    };
    const cp2 = {
      x: p2.x - tangents[(i + 1) % numPoints].x,
      y: p2.y - tangents[(i + 1) % numPoints].y,
    };
    d += ` C${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${p2.x},${p2.y}`;
  }
  return closed ? `${d} Z` : d;
}

function drawLegend(
  g: SVGGroup,
  curves: RadarCurve[],
  showLegend: boolean,
  config: Required<RadarDiagramConfig>
) {
  if (!showLegend) {
    return;
  }

  // Create a legend group and position it in the top-right corner of the chart.
  const legendX = ((config.width / 2 + config.marginRight) * 3) / 4;
  const legendY = (-(config.height / 2 + config.marginTop) * 3) / 4;
  const lineHeight = 20;

  curves.forEach((curve, index) => {
    const itemGroup = g
      .append('g')
      .attr('transform', `translate(${legendX}, ${legendY + index * lineHeight})`);

    // Draw a square marker for this curve.
    itemGroup
      .append('rect')
      .attr('width', 12)
      .attr('height', 12)
      .attr('class', `radarLegendBox-${index}`);

    // Draw the label text next to the marker.
    itemGroup
      .append('text')
      .attr('x', 16)
      .attr('y', 0)
      .attr('class', 'radarLegendText')
      .text(curve.label);
  });
}

export const renderer: DiagramRenderer = { draw };
