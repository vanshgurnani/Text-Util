import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import axios from 'axios';

function BarChart() {
  const chartRef = useRef(null);
  const [data, setData] = useState([]);

  useEffect(() => {
    // Fetch data from your API using Axios
    axios.get('https://text-util-83cs.vercel.app/api/fetch-notes')
      .then((response) => {
        setData(response.data);
      })
      .catch((error) => {
        console.error('Error fetching data:', error);
      });
  }, []);

  useEffect(() => {
    // Create the bar chart when data changes
    if (data.length === 0) {
      return;
    }

    // Define chart dimensions and margins
    const margin = { top: 20, right: 30, bottom: 40, left: 40 };
    const width = 600 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    // Create SVG container
    const svg = d3.select(chartRef.current)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Create scales
    const xScale = d3.scaleBand()
      .domain(data.map((d, i) => i))
      .range([0, width])
      .padding(0.1);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(data, (d) => d.content.length)]) // Assuming you want to visualize note lengths
      .nice()
      .range([height, 0]);

    // Create bars
    svg.selectAll('rect')
      .data(data)
      .enter()
      .append('rect')
      .attr('x', (d, i) => xScale(i))
      .attr('y', (d) => yScale(d.content.length))
      .attr('width', xScale.bandwidth())
      .attr('height', (d) => height - yScale(d.content.length))
      .attr('fill', 'steelblue');

    // Add labels to bars (optional)
    svg.selectAll('text')
      .data(data)
      .enter()
      .append('text')
      .text((d) => d.content.length)
      .attr('x', (d, i) => xScale(i) + xScale.bandwidth() / 2)
      .attr('y', (d) => yScale(d.content.length) - 5)
      .style('text-anchor', 'middle');

    // Create x-axis label
    svg.append('text')
    .attr('class', 'x-axis-label')
    .attr('x', width / 2)
    .attr('y', height + margin.bottom - 5)
    .style('text-anchor', 'middle')
    .text('Notes'); // Add your desired label for the X-axis

    // Create y-axis label
    svg.append('text')
    .attr('class', 'y-axis-label')
    .attr('x', -height / 2)
    .attr('y', -margin.left + 10)
    .style('text-anchor', 'middle')
    .attr('transform', 'rotate(-90)')
    .text('Character Count'); // Add your desired label for the Y-axis
    

    // Create x-axis
    svg.append('g')
      .attr('transform', `translate(0, ${height})`)
      .call(d3.axisBottom(xScale).tickFormat((_, i) => i));

    // Create y-axis
    svg.append('g')
      .call(d3.axisLeft(yScale));
  }, [data]);

  return(
    <>
    <h1 className='mx-5'>Bar Chart</h1>
    <h3 className='mx-5'>Character count Graph</h3>
    <div ref={chartRef}></div>
    </>
  )
}

export default BarChart;
