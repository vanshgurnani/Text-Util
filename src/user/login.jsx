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

    if ( !email || !password) {
      setError('Please fill in all the fields.');
      return;
    }

    try {
      const response = await axios.post('https://text-util-five.vercel.app/api/login', { email, password });
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
    <div className="container d-flex align-items-center justify-content-center">
  <div className="card bg-transparent" style={{ maxWidth: '400px', width: '100%',marginTop:'10%' }}>
    <div className="card-body">
      <h2 className="card-title text-center">Login</h2>
      {error && <div className="alert alert-danger text-center" role="alert">{error}</div>}
      {response && (
        <div className={`alert ${response.includes('Successful') ? 'alert-danger' : 'alert-success'}`} role="alert">
          {response}
        </div>
      )}
      <form>
        <div className="form-group mb-3">
          <input
            type="email"
            className="form-control"
            placeholder='Email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="form-group mb-3">
          <input
            type="password"
            className="form-control"
            placeholder='Password'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button type="button" className="btn btn-primary mt-3 w-100" onClick={handleLogin}>
          Login
        </button>
        <button type="button" className="btn btn-danger mt-3 w-100">
          <a className='text-white' href="/register" style={{ textDecoration: 'none' }}>Register</a>
        </button>
      </form>
    </div>
  </div>
</div>


  );
}

export default LoginForm;
