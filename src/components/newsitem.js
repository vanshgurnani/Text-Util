import React, { Component } from 'react';

export class newsitem extends Component {
  

  render() {
    let { title, description, imageurl, newsUrl } = this.props;

    return (
      <>
        <div className="card" style={{ width: "20rem" }}>
          <img src={!imageurl?"https://economictimes.indiatimes.com/thumb/msid-103017164,width-1070,height-580,imgsize-494471,overlay-etmarkets/photo.jpg":imageurl} className="card-img-top" alt="..." />
          <div className="card-body">
            <h5 className="card-title">{title}</h5>
            <p className="card-text">{description}</p>
            <a href={newsUrl} className="btn btn-primary" target='_blank'>Read More</a>
          </div>
        </div>
      </>
    );
  }
}

export default newsitem;

