import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "./AuthContext.jsx";

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth(); // Use the login function from AuthContext

  const handleLogin = async () => {
    try {
      // Updated URL to call the Azure Function
      const response = await axios.post('/api/login_user', { username, password });
      // Use the token returned from the Azure Function
      login(response.data.token);
      navigate('/');  // Redirect to the dashboard after login
    } catch (err) {
      setError('Invalid username or password.');
    }
  };

  return (
    <div className="login-container">
      <h2>Welcome Back</h2>
      <input 
        type="text" 
        placeholder="Username" 
        value={username} 
        onChange={e => setUsername(e.target.value)} 
      />
      <input 
        type="password" 
        placeholder="Password" 
        value={password} 
        onChange={e => setPassword(e.target.value)} 
      />
      <button onClick={handleLogin}>Login</button>
      {error && <div className="error">{error}</div>}
    </div>
  );
};

export default Login;
