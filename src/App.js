import React,{useState,useEffect} from 'react'
import { BrowserRouter as Router, Routes, Route} from "react-router-dom";
// import Home from '../src/components/home';
import TextArea from '../src/components/textarea';
import About from '../src/components/about';
import Navbar from '../src/components/navbar';
import Alert from '../src/components/alert';
import News from './news/news';
import Insight from '../src/components/insight';
import Summary from './summary/summary';
import Login from './user/login';
import Register from './user/registers';


function App(props) {
  const [mode,setMode]=useState('light');
  const [alert,setAlert]=useState(null);
  
    const api = process.env.REACT_APP_NEWS_API;
    // const api="3e69e2dc8d9241889ee2d1372eafa6e7";

  // Default background color based on the mode
  const backgroundColor = mode === 'light' ? '#D2B48C' : '#0A3A5E';
  useEffect(() => {
    document.body.style.backgroundColor = backgroundColor; // Set default background color
  }, [mode, backgroundColor]);

  
  const showAlert=(message,type)=>{
      setAlert({
        msg:message,
        type:type
      })
  }
  const toggleMode = ()=>{
    if (mode==='light') {
      setMode('dark');
      document.body.style.backgroundColor='#0A3A5E';
      showAlert("Dark Mode has been enabled","success");
      document.title="Notepad Dark Mode";
    }
    else{
      setMode('light');
      showAlert("Light Mode has been enabled","warning");
      document.title="Notepad Light Mode";
      console.log(api)
    }
  }

  const renderNavbar = () => {
    const currentPath = window.location.pathname;
    if (currentPath === '/register' || currentPath === '/') {
      return null; // Don't render Navbar for register and login paths
    }
    return <Navbar head="NotePad" mode={mode} toggleMode={toggleMode} />;
  };
  

  return (
    <>
    <Router>
    {renderNavbar()}
    <Alert alert={alert}/>
      <Routes>
        <Route exact path='/notes' element={<TextArea showAlert={showAlert} head="Welcome to NotePad" mode={mode} />}/>
        <Route exact path='/about' element={<About mode={mode} />}/>
        <Route exact path='/general' element={<News key="general" heading="General" apiKey={api}  pageSize={5} country="in" category="general" mode={mode} />}/>
        <Route exact path='/business' element={<News key="business" heading="Business" apiKey={api}  pageSize={5} country="in" category="business" mode={mode} />}/>
        <Route exact path='/entertainment' element={<News key="entertainment" apiKey={api}  heading="Entertainment" pageSize={5} country="in" category="entertainment" mode={mode} />}/>

        <Route exact path='/health' element={<News key="health" heading="Health" apiKey={api}  pageSize={5} country="in" category="health" mode={mode} />}/>
        <Route exact path='/science' element={<News key="science" heading="Science" apiKey={api}  pageSize={5} country="in" category="science" mode={mode} />}/>
        <Route exact path='/sports' element={<News key="sports" heading="Sports" apiKey={api}  pageSize={5} country="in" category="sports" mode={mode} />}/>
        <Route exact path='/technology' element={<News key="technology" apiKey={api} heading="Technology"  pageSize={5} country="in" category="technology" mode={mode} />}/>
        <Route exact path='/insight' element={<Insight mode={mode} />}/>
        <Route exact path='/summary' element={<Summary mode={mode} />} />


        <Route exact path='/' element={<Login mode={mode} />} />
        <Route exact path='/register' element={<Register mode={mode} />} />

        </Routes>
    </Router>
    </>
  );
}

export default App;
  


