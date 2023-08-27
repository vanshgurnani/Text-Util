import React, { useState, useEffect } from 'react';
import NewsItem from '../components/newsitem';
import Loader from './spinner';
import PropTypes from 'prop-types';

function News(props) {
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalResults, setTotalResults] = useState(0);

    const updateNews = async (pageNo) => {
        const url = `https://newsapi.org/v2/top-headlines?country=${props.country}&category=${props.category}&apikey=${props.apiKey}&page=${page}&pageSize=${props.pageSize}`;
        setLoading(true);
        let data = await fetch(url);
        let parsedData = await data.json();
        setArticles(parsedData.articles);
        setTotalResults(parsedData.totalResults);
        setLoading(false);
    }

    useEffect(() => {
        document.title = "News App " + props.category;
        updateNews();
    }, [page]);

    const handleNextClick = () => {
        setPage(page + 1);
        
    }

    const handlePrevClick = () => {
        setPage(page - 1);
    }

    let mystyle = {
        color: props.mode === 'dark' ? 'white' : '#042743'
    };

    return (
        <div className='container my-3' style={mystyle}>
            <h1 className='text-center'>This is {props.heading} Page - Top Headlines!</h1>
            <div className="container d-flex justify-content-between">
                <button disabled={page <= 1} type="button" className="btn btn-dark" onClick={handlePrevClick}>
                    &larr; Previous
                </button>
                <button disabled={page >= 5} type="button" className="btn btn-dark" onClick={handleNextClick}>
                    Next &rarr;
                </button>
            </div>
            {loading && <Loader />}
            <div className="row mx-5">
                {!loading && articles.map((element) => (
                    <div className="col-md-4" key={element.url}>
                        <NewsItem
                            title={element.title}
                            description={element.description}
                            imageurl={element.urlToImage}
                            newsUrl={element.url}
                            author={element.author}
                            date={element.publishedAt}
                            source={element.source.name}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

News.defaultProps = {
    country: 'in',
    pageSize: 8,
    category: "general",
    heading: "General",
};

News.propTypes = {
    country: PropTypes.string,
    pageSize: PropTypes.number,
    category: PropTypes.string,
    heading: PropTypes.string,
};

export default News;
