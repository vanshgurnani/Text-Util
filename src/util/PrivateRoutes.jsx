import { Outlet, Navigate } from 'react-router-dom';

const PrivateRoutes = () => {
    // Check if the user is authenticated based on the token
    const isAuthenticated = !!localStorage.getItem('token'); // Assuming the token is stored in localStorage

    return isAuthenticated ? <Outlet /> : <Navigate to="/" />;
};

export default PrivateRoutes;
