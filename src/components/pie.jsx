import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

function PieChart() {
  const chartRef = useRef(null);

  useEffect(() => {
    // Data for the pie chart (hardcoded)
    const data = [
      { name: 'Category 1', count: 10 },
      { name: 'Category 2', count: 20 },
      { name: 'Category 3', count: 15 },
      // Add more data points as needed
    ];

    // Create the pie chart
    const width = 300; // Width of the SVG container
    const height = 300; // Height of the SVG container
    const radius = Math.min(width, height) / 2; // Radius of the pie chart

    const svg = d3.select(chartRef.current)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    const color = d3.scaleOrdinal(d3.schemeCategory10);

    const pie = d3.pie().value((d) => d.count);
    const path = d3.arc()
      .outerRadius(radius - 10)
      .innerRadius(0);

    const arc = svg.selectAll('.arc')
      .data(pie(data))
      .enter()
      .append('g')
      .attr('class', 'arc');

    arc.append('path')
      .attr('d', path)
      .attr('fill', (d) => color(d.data.name));

    arc.append('text')
      .attr('transform', (d) => `translate(${path.centroid(d)})`)
      .attr('dy', '0.35em')
      .text((d) => d.data.name);
  }, []);

  return (
    <>
      <h1 className='mx-5'>Hardcoded Pie Chart</h1>
      <div ref={chartRef}></div>
    </>
  );
}

export default PieChart;
