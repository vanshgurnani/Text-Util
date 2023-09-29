import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import axios from 'axios';

function BookmarkGraph() {
  const chartRef = useRef(null);
  const [userId, setUserId] = useState('');
  const [data, setData] = useState([]);

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

    // Fetch bookmarked notes from your server using the userId
    axios
      .get(`https://text-util-five.vercel.app/api/bookmarked-notes/${userId}`)
      .then((response) => {
        const bookmarkedNotes = response.data.bookmarkedNotes;

        // Calculate total character count for each category
        const categoryCounts = {};

        bookmarkedNotes.forEach((note) => {
          const { category, content } = note;

          if (!categoryCounts[category]) {
            categoryCounts[category] = 0;
          }

          categoryCounts[category] += content.length;
        });

        // Prepare data for the bar chart
        const barChartData = Object.entries(categoryCounts).map(([category, totalCharacterCount]) => ({
          category,
          totalCharacterCount,
        }));

        setData(barChartData);
      })
      .catch((error) => {
        console.error('Error fetching data:', error);
      });
  }, [userId]);

  useEffect(() => {
    if (data.length === 0) {
      return;
    }

    // Create the bar chart
    const width = 500; // Width of the SVG container
    const height = 300; // Height of the SVG container
    const margin = { top: 20, right: 30, bottom: 40, left: 40 };

    const svg = d3.select(chartRef.current).append('svg').attr('width', width).attr('height', height);

    const x = d3
      .scaleBand()
      .domain(data.map((d) => d.category))
      .range([margin.left, width - margin.right])
      .padding(0.1);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.totalCharacterCount)])
      .nice()
      .range([height - margin.bottom, margin.top]);

    // Add x-label
    svg
      .append('text')
      .attr('x', width / 2)
      .attr('y', height - margin.bottom / 2)
      .attr('text-anchor', 'middle')
      .text('Categories');

    // Add y-label
    svg
      .append('text')
      .attr('x', -height / 2)
      .attr('y', margin.left / 2)
      .attr('text-anchor', 'middle')
      .attr('transform', 'rotate(-90)')
      .text('Total Character Count');

    svg
      .selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', (d) => x(d.category))
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

    svg.selectAll('.x-axis text').attr('transform', 'rotate(-45)').style('text-anchor', 'end');
  }, [data]);

  return (
    <div className='text-center'>
      <h1 className='mx-5'>Bookmark Graph</h1>
      <h3 className='mx-5'>Category Graph for Bookmarked Notes</h3>
      <div ref={chartRef} width={400} height={200}></div>
    </div>
  );
}

export default BookmarkGraph;
