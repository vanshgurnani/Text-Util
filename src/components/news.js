import React, { Component } from 'react';
import NewsItem from '../components/newsitem';
import Loader from './spinner';
import PropTypes from 'prop-types';

export default class News extends Component {
    static defaultProps = {
        country: 'in',
        pageSize: 8,
        category:"general",
        heading:"General",
    }

    static propTypes = {  
        country: PropTypes.string,
        pageSize: PropTypes.number,
        category: PropTypes.string,
        heading: PropTypes.string,
    }


    constructor(props) {
        super(props);
        this.state = {
            articles: [],
            loading: false,
            page: 1,
            totalResults: 0 
        };
    }

    async updateNews(pageNo){
        const url = `https://newsapi.org/v2/top-headlines?country=${this.props.country}&category=${this.props.category}&apikey=dbe57b028aeb41e285a226a94865f7a7&page=${this.state.page}&pageSize=${this.props.pageSize}`;
        this.setState({ loading: true });
        let data = await fetch(url);
        let parsedData = await data.json()
        this.setState({
            articles: parsedData.articles,
            totalResults: parsedData.totalResults,
            loading: false
        })
    }

    
    async componentDidMount() {
        this.updateNews();
    }

    handleNextClick = async () => {
        this.setState({ page: this.state.page + 1 });
        this.updateNews();
    }

    handlePrevClick = async () => {
        this.setState({ page: this.state.page - 1 });
        this.updateNews();
    }

    render() {
        let mystyle = {
            color: this.props.mode === 'dark' ? 'white' : '#042743'
        };
        let {heading}=this.props;
        return (
            <div className='container my-3' style={mystyle}>
                <h1 className='text-center'>This is {heading} Page - Top Headlines!</h1>
                <div className="container d-flex justify-content-between">
                        <button disabled={this.state.page <= 1} type="button" className="btn btn-dark" onClick={this.handlePrevClick}>
                            &larr; Previous
                        </button>
                        <button disabled={this.state.page>=5} type="button" className="btn btn-dark" onClick={this.handleNextClick}>
                            Next &rarr;
                        </button>
                        {/*+ 1 > Math.ceil(this.state.totalResults / 20*/}
                </div>
                {this.state.loading && <Loader />}
                <div className="row mx-5">
                    {!this.state.loading && this.state.articles.map((element) => (
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
                    {/*<div className="container d-flex justify-content-between">
                        <button disabled={this.state.page <= 1} type="button" className="btn btn-dark" onClick={this.handlePrevClick}>
                            &larr; Previous
                        </button>
                        <button disabled={this.state.page >= 3} type="button" className="btn btn-dark" onClick={this.handleNextClick}>
                            Next &rarr;
                        </button>
                    </div>*/}
            </div>
        );
    }
}