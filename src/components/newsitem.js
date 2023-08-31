import React from 'react';
import './news.css';

function NewsItem(props) {
  let { title, description, imageurl, newsUrl, author, date, source } = props;

  return (
    <div className="card my-2" style={{ width: "20rem" }}>
      <img src={!imageurl ? "https://img.freepik.com/free-vector/breaking-news-concept_23-2148514216.jpg?w=2000" : imageurl} className="card-img-top news-image" alt="..." />
      <div className="card-body">
        <h5 className="card-title">{title}</h5>
        {/*<p className="card-text">{description}</p>*/}
        <span className="badge text-bg-success">{source}</span>
        <p className="card-text"><small className="text-muted">By {!author ? "Unknown" : author} <br /> on {date}</small></p>
        <a href={newsUrl} className="btn btn-primary" target='_blank' rel="noopener noreferrer">Read More</a>
      </div>
    </div>
  );
}

export default NewsItem;
