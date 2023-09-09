import React, { useState } from 'react';
import axios from 'axios';
import { Link } from "react-router-dom";

function LoginForm() {

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const [responseMessage, setResponseMessage] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await axios.post('https://text-util-83cs.vercel.app/api/login', formData);

      // Store the JWT token securely (e.g., in localStorage)
      localStorage.setItem('token', response.data.token);

      if (response.data.success) {
        setResponseMessage('Login successful');
        window.location.href = '/notepad';
      } else {
        setResponseMessage(response.data.error);
      }
    } catch (error) {
      console.error('Error logging in:', error);
      setResponseMessage('Internal server error');
    }
  };

  return (
    <div className="container">
      <h1>Login</h1>
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label htmlFor="email" className="form-label">
            Email address
          </label>
          <input
            type="email"
            className="form-control"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            required
          />
        </div>
        <div className="mb-3">
          <label htmlFor="password" className="form-label">
            Password
          </label>
          <input
            type="password"
            className="form-control"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary">
          Login
        </button>
        <button type="submit" className="btn btn-danger mx-3">
          <Link style={{ textDecoration: 'none', color: 'white' }} to="signup">Signup</Link>
        </button>
      </form>
      {responseMessage && (
        <div className="mt-3 alert alert-info">{responseMessage}</div>
      )}
    </div>
  );
}

export default LoginForm;