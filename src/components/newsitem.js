import React, { Component } from 'react';
import './news.css';

export class newsitem extends Component {
  

  render() {
    let { title, description, imageurl, newsUrl } = this.props;

    return (
      <>
        <div className="card my-2" style={{ width: "20rem" }}>
          <img  src={!imageurl?"https://media.istockphoto.com/id/1369150014/vector/breaking-news-with-world-map-background-vector.jpg?s=612x612&w=0&k=20&c=9pR2-nDBhb7cOvvZU_VdgkMmPJXrBQ4rB1AkTXxRIKM=":imageurl} className="card-img-top news-image" alt="..." />
          <div className="card-body">
            <h5 className="card-title">{title}</h5>
            {/*<p className="card-text">{description}</p>*/}
            <a href={newsUrl} className="btn btn-primary" target='_blank'>Read More</a>
          </div>
        </div>
      </>
    );
  }
}

export default newsitem;

