// About.js
import React, { useState, useEffect } from 'react';
import userData from './userData';

function About(props) {
  const [style, setStyle] = useState({
    color: 'white',
    backgroundColor: 'black'
  });

  let mystyle = {
    color: props.mode === 'dark' ? 'white' : '#042743',
    backgroundColor: props.mode === 'dark' ? 'rgb(36 74 104)' : 'white'
  };

  return (
    <>
      <div className='d-flex justify-content-center'>
        <div className='container accordion mx-2 my-3' id="accordionExample">
          <h1 className='text-center' style={{ color: props.mode === 'dark' ? 'white' : '#042743' }}>About Us</h1>
          <br />
          {userData.map((user, index) => (
            <div className="accordion-item" key={index}>
              <h2 className="accordion-header">
                <button
                  className={`accordion-button ${index === 0 ? 'collapsed' : ''}`}
                  style={mystyle}
                  type="button"
                  data-bs-toggle="collapse"
                  data-bs-target={`#collapse${index + 1}`}
                  aria-expanded={index === 0}
                  aria-controls={`collapse${index + 1}`}
                >
                  {user.name}
                </button>
              </h2>
              <div
                id={`collapse${index + 1}`}
                className={`accordion-collapse collapse ${index === 0 ? 'show' : ''}`}
                data-bs-parent="#accordionExample"
              >
                <div className="accordion-body" style={mystyle}>
                  <div className="row">
                      <div className="col">
                        <div className="container">
                          <img style={{width:'300px',height:'300px'}} src={user.profile} alt="images" />
                        </div>
                      </div>
                      <div className='col'>
                        <div className="container">
                          <strong>Designation:</strong> {user.designation}<br />
                          <strong>Skills:</strong> {user.skills.join(', ')}<br />
                          <strong>Additional information:</strong> {user.additionalInfo}
                        </div>
                      </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default About;
