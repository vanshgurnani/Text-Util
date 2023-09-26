import React, { useState } from 'react';
import axios from 'axios';
import jwt_decode from 'jwt-decode';;

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [response, setResponse] = useState(''); // State variable for response message
  const [userId, setUserId] = useState(''); // State variable for userId

  const handleLogin = async () => {
    try {
      const response = await axios.post('https://text-util-ykfu.vercel.app/api/login', { email, password });
      const { token } = response.data;
  
      if (response.status === 200) {
        // Extract userId from the JWT token payload
        const decodedToken = jwt_decode(token);
        const userId = decodedToken.userId;
  
        // Handle successful login
        console.log('Login successful');
        setResponse('Login successful');
  
        // Store the token and userId in local storage
        localStorage.setItem('token', token);
        localStorage.setItem('userId', userId);
  
        // Set userId in component state
        setUserId(userId);
  
        // Redirect to another page (e.g., /notes)
        window.location.href = '/notes';
      } else {
        setError('Invalid credentials');
      }
    } catch (error) {
      setError('Server error');
    }
  };
  
  

  return (
    <div className="container">
      <h2>Login</h2>
      {error && <p>{error}</p>}
      {response && (
        <div className={`alert ${response.includes('Successful') ? 'alert-danger' : 'alert-success'}`} role="alert">
          {response}
        </div>
      )}
      <form>
        <div className="form-group">
          <label>Email:</label>
          <input
            type="email"
            className="form-control"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Password:</label>
          <input
            type="password"
            className="form-control"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button type="button" className="btn btn-primary mt-3" onClick={handleLogin}>
          Login
        </button>
        <button type="button" className="btn btn-danger mt-3 mx-3">
          <a className='text-white' href="/register" style={{textDecoration:'none'}}>Register</a>
        </button>
      </form>
    </div>
  );
}

export default LoginForm;
