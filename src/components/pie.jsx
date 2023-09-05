import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import * as d3 from 'd3';

function PieChart() {
  const chartRef = useRef(null);
  const [data, setData] = useState([]);

  useEffect(() => {
    // Fetch data from your API using Axios
    axios.get('https://text-util-83cs.vercel.app/api/fetch-notes')
      .then((response) => {
        // Assuming the response data is an array of objects with a 'category' property
        const notesData = response.data.notes;
        const categoryCounts = {};

        // Calculate category counts
        notesData.forEach((note) => {
          const category = note.category || 'Uncategorized'; // Default to 'Uncategorized' if no category is specified
          categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        });

        // Prepare data for the pie chart
        const pieData = Object.entries(categoryCounts).map(([name, count]) => ({
          name,
          count,
        }));

        setData(pieData);
      })
      .catch((error) => {
        console.error('Error fetching data:', error);
      });
  }, []);

  useEffect(() => {
    if (data.length === 0) {
      return;
    }

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
  }, [data]);

  return(
    <>
    <h1>Pie Chart</h1>
    <div ref={chartRef}></div>
    </>
    
    )
}

export default PieChart;
