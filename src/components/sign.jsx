import React,{useState} from 'react';
import axios from 'axios';

function RegisterForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  });

  const [formErrors, setFormErrors] = useState({
    name: '',
    email: '',
    password: '',
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSubmit = async (e) => {

    try {
      // Send the registration data to the server using Axios POST request
      const response = await axios.post('https://text-util-83cs.vercel.app/api/register', formData);

      if (response.data.success) {
        // Registration successful, you can redirect or show a success message here
        console.log('Registration successful');
      } else {
        // Handle registration errors from the server
        console.error('Registration failed:', response.data.error);
      }
    } catch (error) {
      console.error('Error registering user:', error);
    }
  };
  return (
    <div className="container">
      <h1>Register</h1>
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label htmlFor="name" className="form-label">Name</label>
          <input type="text" className="form-control" id="name" />
        </div>
        <div className="mb-3">
          <label htmlFor="email" className="form-label">Email address</label>
          <input type="email" className="form-control" id="email" aria-describedby="emailHelp" />
        </div>
        <div className="mb-3">
          <label htmlFor="password" className="form-label">Password</label>
          <input type="password" className="form-control" id="password" />
        </div>
        <button type="submit" className="btn btn-primary">Register</button>
      </form>
    </div>
  );
}

export default RegisterForm;
