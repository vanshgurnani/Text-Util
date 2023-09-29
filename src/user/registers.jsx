import React, { useState } from 'react';
import axios from 'axios';

const Registration = () => {
  const [userData, setUserData] = useState({
    username: '',
    email: '',
    password: '',
  });

  const [response, setResponse] = useState(null);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setUserData({ ...userData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!userData.username || !userData.email || !userData.password) {
      setError('Please fill in all the fields.');
      return;
    }

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
    <div className="container d-flex align-items-center justify-content-center">
      <div className="card bg-transparent" style={{ maxWidth: '400px', width: '100%',marginTop:'10%' }}>
        <div className="card-body">
          <h2 className="card-title text-center">Registration</h2>
          {error && <div className="alert alert-danger text-center" role="alert">{error}</div>}
          {response && (
            <div className={`alert ${response.includes('Successful') ? 'alert-success' : 'alert-danger'}`} role="alert">
              {response}
            </div>
          )}
          <form onSubmit={handleSubmit}>
          <div className="mb-3">
          <input
            type="text"
            name="username"
            placeholder='Username'
            value={userData.username}
            onChange={handleChange}
            className="form-control"
            id="username"
          />
        </div>
        <div className="mb-3">
          <input
            type="email"
            name="email"
            placeholder='Email'
            value={userData.email}
            onChange={handleChange}
            className="form-control"
            id="email"
          />
        </div>
        <div className="mb-3">
          <input
            type="password"
            name="password"
            placeholder='Password'
            value={userData.password}
            onChange={handleChange}
            className="form-control"
            id="password"
          />
        </div>
        <button type="submit" className="btn btn-primary mt-3 w-100">
          Register
        </button>
        <button type="button" className="btn btn-danger mt-3 w-100">
          <a className='text-white' href="/" style={{ textDecoration: 'none' }}>Login</a>
        </button>
      </form>
    </div>
  </div>
</div>
  );
};

export default Registration;
