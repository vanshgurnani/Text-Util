import React, { Component } from 'react';
import NewsItem from '../components/newsitem';

export default class news extends Component {
  
    constructor(props) {
        super(props);
        this.state = {
            articles: []
        };
    }
    backendUrl = 'https://localhost:5000/api/news';
    async componentDidMount() {
        console.log("cdm");
        // let url="https://newsapi.org/v2/top-headlines?country=in&category=business&apiKey=3e69e2dc8d9241889ee2d1372eafa6e7";
        // const apiKey = process.env.REACT_APP_API_KEY; // Replace with your actual variable name
        // const url = `https://newsapi.org/v2/top-headlines?country=in&category=business&apiKey=${apiKey}`;
        // let data=await fetch(url);
        const data = await fetch(backendUrl);
        let parsedData=await data.json();
        console.log(parsedData);
        this.setState({articles: parsedData.articles});
        
      }
  render() {
    let mystyle ={
      color:this.props.mode ==='dark'?'white':'#042743'
  
    }
    return (
      <>
        <div className='container my-3' style={mystyle}>
        <h1>This is news App!</h1>
        <div className="row">
            {this.state.articles.map((element)=>{
                return <div className="col-md-4" key={element.url}>
                <NewsItem title={element.title} description={element.description} imageurl={element.urlToImage}
                newsUrl={element.url}
                />

            </div>
            })}
        </div>
        </div>
      </>
    )
  }
}