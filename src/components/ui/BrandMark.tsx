import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

type Props = {
  size?: number;
  background?: string;
  needleColor?: string;
  /** 0 (low) to 1 (high) - where the gauge needle points. */
  needle?: number;
  framed?: boolean;
};

const CX = 50;
const CY = 62;
const R = 30;

function point(angle: number, radius = R) {
  const radians = (angle * Math.PI) / 180;
  return { x: CX + radius * Math.cos(radians), y: CY + radius * Math.sin(radians) };
}

function arc(start: number, end: number) {
  const a = point(start);
  const b = point(end);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${R} ${R} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/** MOSI logo: a three-band risk gauge. Mirrors the launcher icon artwork. */
export function BrandMark({ size = 72, background = '#1F5C45', needleColor = '#FFFCF6', needle = 0.18, framed = true }: Props) {
  const needleAngle = 186 + needle * 168;
  const tip = point(needleAngle, 23);

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {framed ? <Rect x={0} y={0} width={100} height={100} rx={26} fill={background} /> : null}
      <Path d={arc(186, 228)} stroke="#5BC393" strokeWidth={9} strokeLinecap="round" fill="none" />
      <Path d={arc(250, 290)} stroke="#F0AC2E" strokeWidth={9} strokeLinecap="round" fill="none" />
      <Path d={arc(312, 354)} stroke="#F2695A" strokeWidth={9} strokeLinecap="round" fill="none" />
      <Line x1={CX} y1={CY} x2={tip.x} y2={tip.y} stroke={needleColor} strokeWidth={6} strokeLinecap="round" />
      <Circle cx={CX} cy={CY} r={6.5} fill={needleColor} />
    </Svg>
  );
}
