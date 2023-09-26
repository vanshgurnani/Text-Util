import React, { useState } from 'react';
import axios from 'axios';

const Registration = () => {
  const [userData, setUserData] = useState({
    username: '',
    email: '',
    password: '',
  });

  const [response, setResponse] = useState(null); // State variable for response message

  const handleChange = (e) => {
    const { name, value } = e.target;
    setUserData({ ...userData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('https://text-util-five.vercel.app/api/register', userData);
      console.log(response.data);

      // Set the response message for success
      setResponse('Registration Successful!');
      
      // Clear form fields on successful registration
      setUserData({
        username: '',
        email: '',
        password: '',
      });
    } catch (error) {
      console.error(error);

      // Set the response message for error
      setResponse('Registration failed. Please try again.');
    }
  };

  return (
    <div className="container">
      <h2>Registration</h2>
      {response && ( // Display response message if response is not null
        <div className={`alert ${response.includes('Successful') ? 'alert-success' : 'alert-danger'}`} role="alert">
          {response}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Username</label>
          <input
            type="text"
            name="username"
            value={userData.username}
            onChange={handleChange}
            className="form-control"
            required
          />
        </div>
        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            name="email"
            value={userData.email}
            onChange={handleChange}
            className="form-control"
            required
          />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            name="password"
            value={userData.password}
            onChange={handleChange}
            className="form-control"
            required
          />
        </div>
        <button type="submit" className="btn btn-primary mt-3">
          Register
        </button>
        <button type="button" className="btn btn-danger mt-3 mx-3">
          <a href="/" className='text-white' style={{textDecoration:'none'}}>Login</a>
        </button>
      </form>
    </div>
  );
};

export default Registration;
