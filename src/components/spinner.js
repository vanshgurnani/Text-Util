import React, { Component } from 'react';
// import loading from '../load.gif';

export default class spinner extends Component {

  render() {
    return (
      <div className='d-flex justify-content-center'>
        <div class="spinner-border" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>
    )
  }
}
