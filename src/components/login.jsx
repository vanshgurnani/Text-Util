import React, { useState } from 'react';
import axios from 'axios';

const Login = () => {
  const [loginData, setLoginData] = useState({
    email: '',
    password: '',
  });

  const [response, setResponse] = useState(null); // State variable for response message

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLoginData({ ...loginData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('https://text-util-ykfu.vercel.app/api/login', loginData);
      console.log(response.data);

      // Check if login is successful
      if (response.status === 200 && response.data.success) {
        // Set the response message for success
        setResponse('Login Successful!');
        
        // Clear form fields on successful login
        setLoginData({
          email: '',
          password: '',
        });

        window.location.href = '/';
      } else {
        // Set the response message for unsuccessful login
        setResponse('Login failed. Please check your credentials and try again.');
      }
    } catch (error) {
      console.error(error);

      // Set the response message for error
      setResponse('Login failed. Please check your credentials and try again.');
    }
  };

  return (
    <div className="container">
      <h2>Login</h2>
      {response && ( // Display response message if response is not null
        <div className={`alert ${response.includes('Successful') ? 'alert-success' : 'alert-danger'}`} role="alert">
          {response}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            name="email"
            value={loginData.email}
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
            value={loginData.password}
            onChange={handleChange}
            className="form-control"
            required
          />
        </div>
        <button type="submit" className="btn btn-primary">
          Login
        </button>
      </form>
    </div>
  );
};

export default Login;

