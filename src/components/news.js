import React, { Component } from 'react';
import NewsItem from '../components/newsitem';

export default class News extends Component {
    constructor(props) {
        super(props);
        this.state = {
            articles: [],
            loading: false,
            page: 1,
            totalResults: 0 
        };
    }

    async componentDidMount() {
        // Fetch initial data
        const url = `https://newsapi.org/v2/top-headlines?country=in&category=business&apiKey=3e69e2dc8d9241889ee2d1372eafa6e7&page=1&pageSize=${this.props.pageSize}`;
        const response = await fetch(url);
        const data = await response.json();
        this.setState({
            articles: data.articles,
            totalResults: data.totalResults
        });
    }

    handleNextClick = async () => {
      console.log("Next");
      
      let url = `https://newsapi.org/v2/top-headlines?country=in&apiKey=3e69e2dc8d9241889ee2d1372eafa6e7&page=${this.state.page + 1}&pageSize=${this.props.pageSize}`;
      let data = await fetch(url);
      let parsedData = await data.json();
      console.log(parsedData);
      this.setState({
          page: this.state.page + 1,
          articles: parsedData.articles
      });
  }
  

    handlePrevClick = async () => {
        console.log("Previous");
        const prevPage = this.state.page - 1;
        const url = `https://newsapi.org/v2/top-headlines?country=in&apiKey=3e69e2dc8d9241889ee2d1372eafa6e7&page=${prevPage}&pageSize=${this.props.pageSize}`;
        const response = await fetch(url);
        const parsedData = await response.json();
        this.setState({
            page: prevPage,
            articles: parsedData.articles
        });
    }

    render() {
        let mystyle = {
            color: this.props.mode === 'dark' ? 'white' : '#042743'
        };

        return (
            <div className='container my-3' style={mystyle}>
                <h1>This is news App!</h1>
                <div className="row">
                    {this.state.articles.map((element) => (
                        <div className="col-md-4" key={element.url}>
                            <NewsItem
                                title={element.title}
                                description={element.description}
                                imageurl={element.urlToImage}
                                newsUrl={element.url}
                            />
                        </div>
                    ))}
                </div>
                <div className='container d-flex justify-content-between'>
                    <div className="container d-flex justify-content-between">
                        <button disabled={this.state.page <= 1} type="button" className="btn btn-dark" onClick={this.handlePrevClick}>
                            &larr; Previous
                        </button>
                        <button disabled={this.state.page >= 3} type="button" className="btn btn-dark" onClick={this.handleNextClick}>
                            Next &rarr;
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}