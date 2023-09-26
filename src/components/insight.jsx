import React from 'react';
import Line from '../analysis/line';
import Bar2 from '../analysis/bar2';
import Bar3 from '../analysis/bar3';

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
