import React from 'react';
import Line from '../components/line';
// import Bar from '../components/bar';
import Bar2 from '../components/bar2';
import Bar3 from '../components/bar3';

function insight(props) {
  return (
    <div className='container' style={{ color: props.mode === 'dark' ? 'white' : '#042743' }}>
      <Line />
      <br />
      <br />
      <Bar2 />
      <br />
      <br />
      <Bar3 />
      <br />
      <br />
    </div>
  )
}

export default insight
