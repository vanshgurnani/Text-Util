import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import axios from 'axios';

function BarGraph() {
  const chartRef = useRef(null);
  const [data, setData] = useState([]);
  const [userId, setUserId] = useState('');

  useEffect(() => {
    // Retrieve userId from local storage on component mount
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      setUserId(storedUserId);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      // No user ID available, so return early
      return;
    }

    // Fetch data from your server using the userId
    axios
      .get(`https://text-util-five.vercel.app/api/fetch-notes/${userId}`)
      .then((response) => {
        const responseData = response.data;

        if (!responseData || !Array.isArray(responseData.notes)) {
          // Handle the case where the API response does not contain the expected data structure
          console.error('Invalid data format in API response:', responseData);
          return;
        }

        const notesData = responseData.notes;

        // Group notes into intervals of 10 and calculate total character count for each interval
        const intervalSize = 10;
        const groupedData = [];
        for (let i = 0; i < notesData.length; i += intervalSize) {
          const intervalNotes = notesData.slice(i, i + intervalSize);
          const totalCharacterCount = intervalNotes.reduce((acc, note) => acc + note.content.length, 0);
          groupedData.push({
            intervalId: i / intervalSize + 1,
            totalCharacterCount,
          });
        }

        setData(groupedData);
      })
      .catch((error) => {
        console.error('Error fetching data:', error);
      });
  }, [userId]);

  useEffect(() => {
    if (data.length === 0) {
      return;
    }

    // Create the bar graph
    const width = 500; // Width of the SVG container
    const height = 300; // Height of the SVG container
    const margin = { top: 20, right: 30, bottom: 40, left: 40 };

    const svg = d3.select(chartRef.current).append('svg').attr('width', width).attr('height', height);

    const x = d3
      .scaleBand()
      .domain(data.map((d) => d.intervalId))
      .range([margin.left, width - margin.right])
      .padding(0.1);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.totalCharacterCount)])
      .nice()
      .range([height - margin.bottom, margin.top]);

    svg
      .selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', (d) => x(d.intervalId))
      .attr('y', (d) => y(d.totalCharacterCount))
      .attr('width', x.bandwidth())
      .attr('height', (d) => y(0) - y(d.totalCharacterCount))
      .attr('fill', 'steelblue');

    svg
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).tickSize(0));

    svg
      .append('g')
      .attr('class', 'y-axis')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(5));

    // Add x-label
    svg
      .append('text')
      .attr('x', width / 2)
      .attr('y', height - margin.bottom / 2)
      .attr('text-anchor', 'middle')
      .text('Interval ID');

    // Add y-label
    svg
      .append('text')
      .attr('x', -height / 2)
      .attr('y', margin.left / 2)
      .attr('text-anchor', 'middle')
      .attr('transform', 'rotate(-90)')
      .text('Total Character Count');
  }, [data]);

  return (
    <div className='text-center'>
      <h1 className='mx-5'>Bar Graph</h1>
      <h3 className='mx-5'>Total Character Count for Each 10-Note Interval</h3>
      <div ref={chartRef} width={400} height={200}></div>
    </div>
  );
}

export default BarGraph;
