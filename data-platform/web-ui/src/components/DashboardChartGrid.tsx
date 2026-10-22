import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dashboardGridLayout } from '../utils/dashboardGrid.mjs';

export type ChartGridPlacement = { span: number; row: number; height: number; index: number };

export const DashboardChartGrid: React.FC<{
  charts: any[];
  maxColumns?: number;
  children: (chart: any, placement: ChartGridPlacement) => React.ReactNode;
}> = ({ charts, children, maxColumns = 3 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(3);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const width = element.getBoundingClientRect().width;
      setColumns(width >= 1080 ? 3 : width >= 740 ? 2 : 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const usableColumns = Math.min(columns, maxColumns);
  const layout = dashboardGridLayout(charts, usableColumns);
  useLayoutEffect(()=>{
    const root=ref.current;if(!root)return;
    let frame=0;
    const align=()=>{
      const cards=Array.from(root.querySelectorAll<HTMLElement>(':scope > [data-dashboard-chart]'));
      const variables=['--chart-header-height','--chart-body-height','--chart-footer-height'];
      for(const card of cards)for(const variable of variables)card.style.removeProperty(variable);
      const groups=new Map<string,HTMLElement[]>();
      for(const card of cards){const row=card.dataset.chartRow||'0';groups.set(row,[...(groups.get(row)||[]),card]);}
      for(const row of groups.values()){
        const selectors=['[data-chart-header]','[data-chart-viewport]','[data-chart-footer]'];
        const heights=selectors.map(selector=>Math.ceil(Math.max(...row.map(card=>card.querySelector(selector)?.getBoundingClientRect().height||0))));
        for(const card of row)variables.forEach((variable,i)=>card.style.setProperty(variable,`${heights[i]}px`));
      }
    };
    align();
    const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(align);});
    observer.observe(root);
    root.querySelectorAll('[data-chart-header] > *, [data-chart-viewport] > *, [data-chart-footer] > *').forEach(element=>observer.observe(element));
    return()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[charts,columns,maxColumns]);
  // Cards remain siblings with stable keys across breakpoints, retaining open details and chart controls.
  return <div ref={ref} data-dashboard-grid data-grid-columns={usableColumns} className="dashboard-chart-grid grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
    {charts.map((chart, index) => children(chart, layout[index]))}
  </div>;
};
