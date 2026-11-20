//-------------------------------------------------
// This File is used for getting weather data
//-------------------------------------------------

const API_KEY = '3373dadee2a0af594c7a19d5a768aaf2';

// Weather for City Kharagpur
const city = 'Kharagpur';

// Coordinates of Kharagpur : Latitude: 22.3197° N Longitude: 87.3100° E 
const lat = 22.3197;   // your latitude
const lon = 87.3100;   // your longitude

// loads todays Weather Data
async function loadWeather()
{
  const url_today = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric`;

  const res = await fetch(url_today);
  const data = await res.json();

  // Pick values from JSON
  const name = data.name;                    // City Name
  const cityLat = data.coord.lat;            // Latitude
  const cityLong = data.coord.lon;           // Longitude
  const temp = data.main.temp;               // Temperature
  const desc = data.weather[0].description;  // Text Description

  // Update inner HTML / text on page
  document.getElementById('cityName').textContent = name;
  document.getElementById('cityLat').textContent  = cityLat;
  document.getElementById('cityLong').textContent = cityLong;
  document.getElementById('temp').textContent     = temp.toFixed(1);
  document.getElementById('desc').textContent     = desc;
  console.log (data)

}


// Load next Three days weather data
async function loadNext3Days() 
{
  const url_next3days =
    `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}` +
    `&exclude=current,minutely,hourly,alerts&appid=${API_KEY}&units=metric`;

  const res3 = await fetch(url_next3days);
  console.log("Status next3:", res3.status);

  if (!res3.ok) {
    const err = await res3.text();
    console.error("OneCall error:", err);
    let html = '<h3>Next 3 days</h3><ul>';
    html += "<li>Error loading forecast (status " + res3.status + ").</li>";
    for (let i = 1; i <= 3; i++) 
    {
        //const day = data3.daily[i];
        //const date = new Date(day.dt * 1000);
        //const tempDay = day.temp.day;
        html += `<li> Dummy Data <b> Day ${i}:  ${25-i}°C</b></li>`;
    }
    html += '</ul>';
    document.getElementById('forecast').innerHTML = html;
    return;
  }

  const data3 = await res3.json();
  if (!data3.daily || data3.daily.length < 4) {
    console.error("No daily data:", data3);
    document.getElementById('forecast').innerHTML = "No daily forecast data.";
    return;
  }

  let html = '<h3>Next 3 days</h3><ul>';
  for (let i = 1; i <= 3; i++) {
    const day = data3.daily[i];
    const date = new Date(day.dt * 1000);
    const tempDay = day.temp.day;
    html += `<li>${date.toDateString()}: ${tempDay.toFixed(1)} °C</li>`;
  }
  html += '</ul>';
  document.getElementById('forecast').innerHTML = html;
}

//-----------------------------------------
//     Working code for Future Use
//-----------------------------------------
function fetchweatherdata() 
{   
    const url_today1 = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric`;
    fetch(url_today1)
        .then(res => res.json())
        .then(data => console.log(data));
    //document.getElementById("container").innerHTML = data
}

