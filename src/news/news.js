import React, { useState, useEffect } from 'react';
import NewsItem from './newsitem';
import Loader from '../components/spinner';
import PropTypes from 'prop-types';

function News(props) {
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalResults, setTotalResults] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');

    const handleSearch = () => {
        // Perform the search based on the source name
        // You can filter the articles based on the source name and update the state
        const filteredArticles = articles.filter((element) =>
          element.source.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
        setArticles(filteredArticles);
      };
      
    const updateNews = async (pageNo) => {
        // const url = `https://newsapi.org/v2/top-headlines?country=${props.country}&category=${props.category}&apikey=${props.apiKey}&page=${page}&pageSize=${props.pageSize}`;
        const url=`https://gnews.io/api/v4/top-headlines?country=${props.country}&category=${props.category}&apikey=${props.apiKey}&page=${page}&pageSize=${props.pageSize}`;
        setLoading(true);
        let data = await fetch(url);
        let parsedData = await data.json();
        setArticles(parsedData.articles);
        setTotalResults(parsedData.totalResults);
        setLoading(false);

        // Reset the search term when new data is fetched
        setSearchTerm('');
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
        <div className='container my-3 mr-3' style={mystyle}>
        <div className="container d-flex justify-content-between">
                <input
                    type="text"
                    className='mx-4 form-control'
                    placeholder="Search by source name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <button type="button" className="btn btn-primary" onClick={handleSearch}>
                    Search
                </button>
        </div>

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
            <div className="row mx-auto">
                {!loading && articles.map((element) => (
                    <div className="col-md-4" key={element.url}>
                        <NewsItem
                            title={element.title}
                            description={element.description}
                            imageurl={element.image}
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
