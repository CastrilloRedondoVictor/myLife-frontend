import { useMemo } from 'react';
import { LineChart, PieChart } from 'echarts/charts';
import { AriaComponent, DataZoomComponent, GridComponent, LegendComponent, TooltipComponent, ToolboxComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import type { EChartsOption } from 'echarts';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([LineChart, PieChart, AriaComponent, DataZoomComponent, GridComponent, LegendComponent, TooltipComponent, ToolboxComponent, CanvasRenderer]);

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const formatDay = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const sharedTextStyle = { color: '#8790a0', fontFamily: 'DM Sans, sans-serif' };
const sharedTooltip = {
  trigger: 'axis' as const,
  confine: true,
  backgroundColor: '#fff',
  borderColor: '#e8ebf0',
  borderWidth: 1,
  padding: 12,
  textStyle: { color: '#303848', fontFamily: 'DM Sans, sans-serif', fontSize: 12 },
  extraCssText: 'border-radius:12px;box-shadow:0 10px 28px rgba(29,38,58,.14);',
  axisPointer: { type: 'line' as const, lineStyle: { color: '#b8c0ce', type: 'dashed' as const } },
};

export interface CashflowPoint {
  date: string;
  income: number;
  expense: number;
  fixedExpense?: number;
  variableExpense?: number;
}

export function DailyCashflowChart({ data, mode = 'both', expenseMode = 'both' }: { data: CashflowPoint[]; mode?: 'income' | 'expense' | 'both'; expenseMode?: 'both' | 'fixed' | 'variable' }) {
  const chartData = useMemo(() => {
    let incomeCents = 0;
    let expenseCents = 0;
    return data.map((point) => {
      incomeCents += Math.round(point.income * 100);
      expenseCents += Math.round(point.expense * 100);
      return { ...point, incomeToDate: incomeCents / 100, expenseToDate: expenseCents / 100 };
    });
  }, [data]);

  const option = useMemo<EChartsOption>(() => ({
    animationDuration: 650,
    animationEasing: 'cubicOut',
    aria: {
      enabled: true,
      description: mode === 'both'
        ? 'Totales mensuales acumulados de ingresos y gastos por día; el tooltip muestra los importes individuales de ese día.'
        : mode === 'income'
          ? 'Importes diarios de ingresos; el tooltip muestra el importe individual de ese día.'
          : `Importes diarios de gastos ${expenseMode === 'both' ? 'fijos y variables' : expenseMode === 'fixed' ? 'fijos' : 'variables'}; el tooltip muestra el importe individual de ese día.`,
    },
    grid: { top: 58, right: 18, bottom: 34, left: 8, containLabel: true },
    tooltip: {
      ...sharedTooltip,
      formatter: (rawParams) => {
        const points = Array.isArray(rawParams) ? rawParams : [rawParams];
        const firstPoint = points[0] as typeof points[number] & { axisValue?: string | number };
        const date = String(firstPoint?.axisValue ?? firstPoint?.name ?? '');
        const label = new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        const rows = points.map((point) => {
          const dailyPoint = data[point.dataIndex];
          const isIncome = point.seriesName === 'Ingresos';
          const isFixedExpense = point.seriesName === 'Gastos fijos';
          const isVariableExpense = point.seriesName === 'Gastos variables';
          const dailyValue = isIncome ? dailyPoint?.income : isFixedExpense ? dailyPoint?.fixedExpense : isVariableExpense ? dailyPoint?.variableExpense : dailyPoint?.expense;
          const label = isIncome ? (mode === 'both' ? 'Ingresos del día' : 'Ingresos') : isFixedExpense ? 'Gastos fijos' : isVariableExpense ? 'Gastos variables' : mode === 'both' ? 'Gastos del día' : 'Gastos';
          return `<div style="display:flex;justify-content:space-between;gap:18px;margin-top:7px"><span>${label}</span><strong>${euro.format(Number(dailyValue ?? 0))}</strong></div>`;
        }).join('');
        return `<div style="font-weight:700;text-transform:capitalize">${label}</div><div style="font-size:10px;color:#8790a0;margin-top:3px">Importes de ese día</div>${rows}`;
      },
      valueFormatter: (value) => euro.format(Number(value)),
    },
    toolbox: {
      show: true,
      right: 6,
      top: 2,
      itemSize: 13,
      iconStyle: { borderColor: '#929bad' },
      feature: {
        dataZoom: { title: { zoom: 'Seleccionar zoom', back: 'Restablecer zoom' } },
        restore: { title: 'Restablecer gráfica' },
        saveAsImage: { title: 'Descargar gráfica', name: 'ingresos-y-gastos', pixelRatio: 2 },
      },
    },
    dataZoom: [{ type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: false, moveOnMouseWheel: true }],
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: chartData.map((point) => point.date),
      axisLine: { lineStyle: { color: '#e8ebf0' } },
      axisTick: { show: false },
      axisLabel: { ...sharedTextStyle, fontSize: 10, hideOverlap: true, formatter: (value) => formatDay(String(value)) },
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...sharedTextStyle, fontSize: 10, formatter: (value) => euro.format(Number(value)) },
      splitLine: { lineStyle: { color: '#edf0f4', type: 'dashed' } },
    },
    series: [
      ...(mode !== 'expense' ? [{
        name: 'Ingresos',
        type: 'line' as const,
        data: chartData.map((point) => mode === 'both' ? point.incomeToDate : point.income),
        smooth: 0.28,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { color: '#35b696', width: 3, cap: 'round' as const },
        itemStyle: { color: '#35b696', borderColor: '#fff', borderWidth: 2 },
        emphasis: { focus: 'series' as const, scale: 1.5 },
        areaStyle: { color: '#35b696', opacity: 0.13 },
      }] : []),
      ...(mode === 'both' ? [{
        name: 'Gastos',
        type: 'line' as const,
        data: chartData.map((point) => point.expenseToDate),
        smooth: 0.28,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { color: '#ef887b', width: 3, cap: 'round' as const },
        itemStyle: { color: '#ef887b', borderColor: '#fff', borderWidth: 2 },
        emphasis: { focus: 'series' as const, scale: 1.5 },
        areaStyle: { color: '#ef887b', opacity: 0.11 },
      }] : []),
      ...(mode === 'expense' ? (expenseMode === 'both'
        ? [
          ...(data.some((point) => (point.fixedExpense ?? 0) > 0) ? [{ name: 'Gastos fijos', data: data.map((point) => point.fixedExpense ?? 0), color: '#ef887b' }] : []),
          ...(data.some((point) => (point.variableExpense ?? 0) > 0) ? [{ name: 'Gastos variables', data: data.map((point) => point.variableExpense ?? 0), color: '#bb726d' }] : []),
        ]
        : [{
          name: expenseMode === 'fixed' ? 'Gastos fijos' : 'Gastos variables',
          data: data.map((point) => point.expense),
          color: expenseMode === 'fixed' ? '#ef887b' : '#bb726d',
        }]).map((series) => ({
        name: series.name,
        type: 'line' as const,
        data: series.data,
        smooth: 0.28,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { color: series.color, width: 3, cap: 'round' as const },
        itemStyle: { color: series.color, borderColor: '#fff', borderWidth: 2 },
        emphasis: { focus: 'series' as const, scale: 1.5 },
        areaStyle: { color: series.color, opacity: 0.1 },
      })) : []),
    ],
  }), [data, chartData, mode, expenseMode]);

  return <ReactEChartsCore echarts={echarts} option={option} notMerge lazyUpdate opts={{ renderer: 'canvas' }} style={{ width: '100%', height: '100%' }} />;
}

export interface CategoryChartItem {
  name: string;
  value: number;
  color: string;
}

export function ExpenseCategoryChart({ data }: { data: CategoryChartItem[] }) {
  const option = useMemo<EChartsOption>(() => ({
    animationDuration: 650,
    aria: { enabled: true, description: 'Distribución de gastos confirmados por categoría.' },
    tooltip: {
      trigger: 'item',
      confine: true,
      valueFormatter: (value) => euro.format(Number(value)),
      backgroundColor: '#fff',
      borderColor: '#e8ebf0',
      borderWidth: 1,
      textStyle: { color: '#303848', fontFamily: 'DM Sans, sans-serif', fontSize: 12 },
      extraCssText: 'border-radius:12px;box-shadow:0 10px 28px rgba(29,38,58,.14);',
    },
    series: [{
      type: 'pie',
      radius: ['67%', '88%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 5 },
      label: { show: false },
      emphasis: { scale: true, scaleSize: 7, itemStyle: { shadowBlur: 14, shadowColor: 'rgba(35,43,58,.18)' } },
      data: data.map((item) => ({ name: item.name, value: item.value, itemStyle: { color: item.color } })),
    }],
  }), [data]);

  return <ReactEChartsCore echarts={echarts} option={option} notMerge lazyUpdate opts={{ renderer: 'canvas' }} style={{ width: '100%', height: '100%' }} />;
}

export interface PriceHistoryRow extends Record<string, string | number> {
  date: string;
}

export interface PriceHistoryLine {
  key: string;
  label: string;
  color: string;
}

export function PriceHistoryChart({ rows, lines, unit }: { rows: PriceHistoryRow[]; lines: PriceHistoryLine[]; unit: string | null }) {
  const option = useMemo<EChartsOption>(() => ({
    animationDuration: 650,
    aria: { enabled: true, description: 'Historial de precios por supermercado y variante.' },
    grid: { top: 38, right: 20, bottom: 96, left: 8, containLabel: true },
    tooltip: {
      ...sharedTooltip,
      valueFormatter: (value) => `${euro.format(Number(value))}${unit ? ` ${unit}` : ''}`,
    },
    toolbox: {
      show: true,
      right: 8,
      top: 0,
      itemSize: 13,
      iconStyle: { borderColor: '#929bad' },
      feature: {
        restore: { title: 'Restablecer gráfica' },
        saveAsImage: { title: 'Descargar gráfica', name: 'historial-de-precios', pixelRatio: 2 },
      },
    },
    legend: {
      type: 'scroll',
      left: 'center',
      bottom: 0,
      width: '90%',
      textStyle: { ...sharedTextStyle, fontSize: 10 },
      pageIconColor: '#8574dc',
      pageTextStyle: { color: '#8790a0' },
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: false, moveOnMouseWheel: true },
      { type: 'slider', xAxisIndex: 0, height: 18, bottom: 44, borderColor: 'transparent', backgroundColor: '#f3f4f8', fillerColor: 'rgba(133,116,220,.16)', handleStyle: { color: '#8574dc' }, dataBackground: { lineStyle: { color: '#c7cbd4' }, areaStyle: { color: '#e8eaf0' } } },
    ],
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: rows.map((row) => row.date),
      axisLine: { lineStyle: { color: '#e8ebf0' } },
      axisTick: { show: false },
      axisLabel: {
        ...sharedTextStyle,
        fontSize: 10,
        hideOverlap: true,
        formatter: (value) => new Date(`${String(value)}T12:00:00`).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }),
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...sharedTextStyle, fontSize: 10, formatter: (value) => `${Number(value).toFixed(1)} €` },
      splitLine: { lineStyle: { color: '#edf0f4', type: 'dashed' } },
    },
    series: lines.map((line) => ({
      name: line.label,
      type: 'line',
      smooth: 0.2,
      connectNulls: true,
      showSymbol: false,
      symbol: 'circle',
      symbolSize: 7,
      lineStyle: { color: line.color, width: 2.5, cap: 'round' },
      itemStyle: { color: line.color },
      emphasis: { focus: 'series', scale: true },
      data: rows.map((row) => row[line.key] ?? null),
    })),
  }), [rows, lines, unit]);

  return <ReactEChartsCore echarts={echarts} option={option} notMerge lazyUpdate opts={{ renderer: 'canvas' }} style={{ width: '100%', height: '100%' }} />;
}
