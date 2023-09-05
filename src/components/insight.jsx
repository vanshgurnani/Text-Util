import React from 'react';
import Line from '../components/line';
import Bar from '../components/bar';
import Pie from '../components/pie';

function insight() {
  return (
    <div className='container'>
      <Line />
      <Bar />
      <Pie />
    </div>
  )
}

export default insight
