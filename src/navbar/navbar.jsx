import React, { useState, useEffect } from 'react';
import {Link } from 'react-router-dom';
import './navbar.css';
import jwt_decode from 'jwt-decode';

function Navbar(props) {

  const [username, setUsername] = useState('');

  useEffect(() => {
    // Retrieve the token from local storage
    const token = localStorage.getItem('token');

    if (token) {
      // Decode the token to get user information
      const decodedToken = jwt_decode(token);

      if (decodedToken.username) {
        // Set the username in the state
        setUsername(decodedToken.username);
      }
    }
  }, []);

  const handleLogout = () => {
    // Clear local storage
    localStorage.removeItem('token');
    localStorage.removeItem('userId');

    // Redirect to the login page
    window.location.href = '/';
  };
  
  return (
    <>
    <nav className={`navbar navbar-expand-lg navbar-${props.mode} bg-${props.mode}`}>
    <div className="container-fluid">
      <Link className="navbar-brand" to="/notes">{props.head}</Link>
      <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
        <span className="navbar-toggler-icon"></span>
      </button>
      <div className="collapse navbar-collapse" id="navbarSupportedContent">
        <ul className="navbar-nav me-auto mb-2 mb-lg-0">
          <li className="nav-item">
            <Link className="nav-link active" aria-current="page" to="/notes">Home</Link>
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

        <img className='mx-2' src="/images/contact.png" alt="Contact" style={{width:'50px',borderRadius:'50%'}} />

        {username && (
          <span className="navbar-text mx-2">
            Welcome, {username}
          </span>
      )}

      <button className='btn btn-danger mx-3' onClick={handleLogout}>
        Logout
      </button>

        

 
      </div>
    </div>


  </nav>
    </>
  )
}

export default Navbar;
