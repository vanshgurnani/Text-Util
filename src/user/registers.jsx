import React, { useState } from 'react';
import axios from 'axios';

const Registration = () => {
  const [userData, setUserData] = useState({
    username: '',
    email: '',
    password: '',
  });

  const [response, setResponse] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setUserData({ ...userData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await axios.post('https://text-util-five.vercel.app/registers', userData);

      if (response.status === 201) {
        setResponse('Registration Successful!');
        setUserData({
          username: '',
          email: '',
          password: '',
        });
      } else {
        console.error(`Unexpected status code: ${response.status}`);
        setResponse('Registration failed. Please try again.');
      }
    } catch (error) {
      console.error(error);

      if (error.response) {
        console.error(error.response.data);
        setResponse(`Registration failed: ${error.response.data.message}`);
      } else {
        setResponse('Registration failed. Please check your network connection.');
      }
    }
  };

  return (
    <div className="container mt-5">
      <h2>Registration</h2>
      {response && (
        <div className={`alert ${response.includes('Successful') ? 'alert-success' : 'alert-danger'}`} role="alert">
          {response}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label htmlFor="username" className="form-label">
            Username
          </label>
          <input
            type="text"
            name="username"
            value={userData.username}
            onChange={handleChange}
            className="form-control"
            id="username"
            required
          />
        </div>
        <div className="mb-3">
          <label htmlFor="email" className="form-label">
            Email
          </label>
          <input
            type="email"
            name="email"
            value={userData.email}
            onChange={handleChange}
            className="form-control"
            id="email"
            required
          />
        </div>
        <div className="mb-3">
          <label htmlFor="password" className="form-label">
            Password
          </label>
          <input
            type="password"
            name="password"
            value={userData.password}
            onChange={handleChange}
            className="form-control"
            id="password"
            required
          />
        </div>
        <button type="submit" className="btn btn-primary">
          Register
        </button>
      </form>
    </div>
  );
};

export default Registration;
