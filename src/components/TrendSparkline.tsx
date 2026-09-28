import React from 'react';
import { View } from 'react-native';
import { Text } from './ui/Text';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import { useAppTheme } from '../theme';
import { clamp } from '../utils/risk';

type Props = {
  values: number[];
  dayLabels?: string[];
  width?: number;
  height?: number;
  color?: string;
  showAxisLabels?: boolean;
  formatValue?: (v: number) => string;
  highlightIndex?: number;
};

const Y_AXIS_WIDTH = 32;
const X_AXIS_HEIGHT = 16;

export function TrendSparkline({
  values,
  dayLabels,
  width = 240,
  height = 60,
  color,
  showAxisLabels = false,
  formatValue,
  highlightIndex,
}: Props) {
  const theme = useAppTheme();

  if (!values.length) {
    return <View style={{ width, height }} />;
  }

  const showXLabels = !!(dayLabels?.length);
  const chartHeight = showXLabels ? height - X_AXIS_HEIGHT : height;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const mid = (max + min) / 2;
  const stroke = color ?? theme.colors.primary;

  const chartW = showAxisLabels ? width - Y_AXIS_WIDTH - 4 : width;
  const pad = 8;

  const points = values.map((value, index) => {
    const x = pad + (index / Math.max(values.length - 1, 1)) * (chartW - pad * 2);
    const y = chartHeight - pad - clamp((value - min) / range) * (chartHeight - pad * 2);
    return { x, y };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');

  const areaPath =
    `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${chartHeight - pad} L ${points[0].x.toFixed(1)} ${chartHeight - pad} Z`;

  const gradId = `sparkGrad_${stroke.replace(/[^a-z0-9]/gi, '')}`;

  const fmt = formatValue ?? ((v: number) => {
    if (Math.abs(v) >= 100) return Math.round(v).toString();
    if (Math.abs(v) >= 10) return v.toFixed(0);
    return v.toFixed(1);
  });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
      {showAxisLabels ? (
        <View style={{ width: Y_AXIS_WIDTH, justifyContent: 'space-between', alignItems: 'flex-end', paddingVertical: 4, height: chartHeight }}>
          <Text style={{ fontSize: 9, color: theme.colors.textMuted, lineHeight: 11 }}>{fmt(max)}</Text>
          <Text style={{ fontSize: 9, color: theme.colors.textMuted, lineHeight: 11 }}>{fmt(mid)}</Text>
          <Text style={{ fontSize: 9, color: theme.colors.textMuted, lineHeight: 11 }}>{fmt(min)}</Text>
        </View>
      ) : null}

      <Svg width={chartW} height={height}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stroke} stopOpacity="0.20" />
            <Stop offset="1" stopColor={stroke} stopOpacity="0.01" />
          </LinearGradient>
        </Defs>

        {}
        <Path d={areaPath} fill={`url(#${gradId})`} />

        {}
        {highlightIndex != null && points[highlightIndex] ? (
          <Line
            x1={points[highlightIndex].x}
            y1={pad}
            x2={points[highlightIndex].x}
            y2={chartHeight - pad}
            stroke={stroke}
            strokeWidth={1}
            strokeDasharray="3 2"
            opacity={0.5}
          />
        ) : null}

        {}
        <Path d={linePath} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

        {}
        {points.map((point, index) => (
          <Circle
            key={index}
            cx={point.x}
            cy={point.y}
            r={highlightIndex === index ? 5 : 3}
            fill={highlightIndex === index ? stroke : stroke}
            opacity={highlightIndex != null && highlightIndex !== index ? 0.45 : 1}
          />
        ))}

        {}
        {highlightIndex != null && points[highlightIndex] ? (
          <SvgText
            x={points[highlightIndex].x}
            y={Math.max(points[highlightIndex].y - 8, 10)}
            textAnchor="middle"
            fontSize={9}
            fill={stroke}
            fontWeight="700"
          >
            {fmt(values[highlightIndex])}
          </SvgText>
        ) : null}

        {}
        {showXLabels
          ? dayLabels!.map((label, index) =>
              points[index] ? (
                <SvgText
                  key={index}
                  x={points[index].x}
                  y={chartHeight + X_AXIS_HEIGHT - 3}
                  textAnchor="middle"
                  fontSize={8}
                  fill={
                    highlightIndex === index
                      ? stroke
                      : theme.colors.textMuted
                  }
                  fontWeight={highlightIndex === index ? '700' : '400'}
                >
                  {label}
                </SvgText>
              ) : null,
            )
          : null}
      </Svg>
    </View>
  );
}
