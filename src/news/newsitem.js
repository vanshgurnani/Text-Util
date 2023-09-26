import React from 'react';
import './news.css';

function NewsItem(props) {
  let { title, description, imageurl, newsUrl, author, date, source } = props;
  const shareNews = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: description,
          url: newsUrl,
        });
      } catch (error) {
        console.error('Error sharing news:', error);
      }
    } else {
      alert('Sharing is not supported in this browser.');
    }
  };

  return (
    <div className="card my-2" style={{ width: "20rem" }}>
      <img src={!imageurl ? "https://img.freepik.com/free-vector/breaking-news-concept_23-2148514216.jpg?w=2000" : imageurl} className="card-img-top news-image" alt="..." />
      <div className="card-body">
        <h5 className="card-title">{title}</h5>
        {/*<p className="card-text">{description}</p>*/}
        <span className="badge text-bg-success">{source}</span>
        <p className="card-text"><small className="text-muted">By {!author ? "Unknown" : author} <br /> on {date}</small></p>
        <a href={newsUrl} className="btn btn-primary" target='_blank' rel="noopener noreferrer">Read More</a>
        <button className="btn btn-dark mx-2" onClick={shareNews}>
          Share
        </button>
      </div>
    </div>
  );
}

export default NewsItem;
