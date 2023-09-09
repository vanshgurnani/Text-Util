import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

function LineChart() {
  const chartRef = useRef(null);

  useEffect(() => {
    // Fetch data from your server
    fetch('https://text-util-83cs.vercel.app/api/my-notes')
      .then((response) => response.json())
      .then((data) => {
        // Parse date strings into Date objects
        const parseDate = d3.timeParse('%Y-%m-%dT%H:%M:%S.%LZ');
        data.forEach((d) => {
          d.timestamp = parseDate(d.timestamp);
        });

        // Create SVG dimensions
        const margin = { top: 20, right: 30, bottom: 30, left: 40 };
        const width = 600 - margin.left - margin.right;
        const height = 400 - margin.top - margin.bottom;

        // Create SVG container
        const svg = d3.select(chartRef.current)
          .append('svg')
          .attr('width', width + margin.left + margin.right)
          .attr('height', height + margin.top + margin.bottom)
          .append('g')
          .attr('transform', `translate(${margin.left}, ${margin.top})`);

        // Create scales for x and y axes
        const xScale = d3.scaleTime()
          .domain(d3.extent(data, (d) => d.timestamp))
          .range([0, width]);

        // const yScale = d3.scaleLinear()
        //   .domain([0, d3.max(data, (d) => d.content.length)]) // Adjust the domain as needed
        //   .nice()
        //   .range([height, 0]);
        const maxYValue = 50; // Change this to your desired maximum value
        const yScale = d3.scaleLinear()
            .domain([0, maxYValue])
            .nice()
            .range([height, 0]);

        // Create line generator
        const line = d3.line()
          .x((d) => xScale(d.timestamp))
          .y((d) => yScale(d.content.length)); // Use the 'content' field for y values

          // Append x-axis label
          svg.append("text")
          .attr("x", width / 2)
          .attr("y", height + margin.top + 8)
          .style("text-anchor", "middle")
          .text("TimeStamp");

      // Append y-axis label
      svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -margin.left)
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .text("Length of Content");

        // Append the line to the SVG
        svg.append('path')
          .datum(data)
          .attr('fill', 'none')
          .attr('stroke', 'steelblue')
          .attr('stroke-width', 2)
          .attr('d', line);

        // Append x-axis
        svg.append('g')
          .attr('transform', `translate(0, ${height})`)
          .call(d3.axisBottom(xScale));

        // Append y-axis
        svg.append('g')
          .call(d3.axisLeft(yScale));
      })
      .catch((error) => {
        console.error('Error fetching data:', error);
      });
  }, []);

  return(
    <>
    <h1 className='mx-5'>Line Chart</h1>
    <h3 className='mx-5'>Length & Time Graph</h3>
    <div ref={chartRef}></div>
    </>
  );
}

export default LineChart;
