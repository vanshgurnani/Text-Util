import React from 'react'
import {Link } from 'react-router-dom';
import '../components/navbar.css';

function navbar(props) {
  
  return (
    <>
    <nav className={`navbar navbar-expand-lg navbar-${props.mode} bg-${props.mode}`}>
    <div className="container-fluid">
      <Link className="navbar-brand" to="/">{props.head}</Link>
      <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
        <span className="navbar-toggler-icon"></span>
      </button>
      <div className="collapse navbar-collapse" id="navbarSupportedContent">
        <ul className="navbar-nav me-auto mb-2 mb-lg-0">
          <li className="nav-item">
            <Link className="nav-link active" aria-current="page" to="/">Home</Link>
          </li>
          <li className="nav-item">
            <Link className="nav-link active" aria-current="page" to="/about">About</Link>
          </li>
          
          
          
          <li className="nav-item">
            <Link className="nav-link active" aria-current="page" to="/insight">Insight</Link>
          </li>
          <li className="nav-item">
            <Link className="nav-link active" aria-current="page" to="/summary">Summary</Link>
          </li>

          <li className="nav-item dropdown">
            <Link className="nav-link dropdown-toggle active" to="/general" role="button" data-bs-toggle="dropdown" aria-expanded="false">
              News
            </Link>
                <ul className={`dropdown-menu `} >
                  <li className="item"><Link className="dropdown-item link" aria-current="page" to="/general">General</Link></li>
                  <li className='item'><Link className="dropdown-item link" aria-current="page" to="/technology">Technology</Link></li>
                  <li className='item'><Link className="dropdown-item link" aria-current="page" to="/sports">Sports</Link></li>
                  <li className='item'><Link className="dropdown-item link" aria-current="page" to="/business"> Business</Link></li>
                  <li className='item'><Link className="dropdown-item link" aria-current="page" to="/entertainment">Entertainment</Link></li>
                  <li className='item'><Link className="dropdown-item link" aria-current="page" to="/health">Health</Link></li>
                  <li className='item'><Link className="dropdown-item link" aria-current="page" to="/science">Science</Link></li>
                </ul>
              </li>

        </ul>
        <div className={`mx-2 form-check form-switch text-${props.mode === 'light' ? 'dark' : 'light'}`}>
          <input className="form-check-input" type="checkbox" onClick={props.toggleMode} role="switch" id="flexSwitchCheckDefault"/>
          <label className="form-check-label" htmlFor="flexSwitchCheckDefault">
            {props.mode === 'light' ? 'Enable Dark Mode' : 'Enable Light Mode'}
          </label>
        </div>

 
      </div>
    </div>
  </nav>
    </>
  )
}

export default navbar;
