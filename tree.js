'use strict'
import Interactive from "https://vectorjs.org/interactive.js";

// Set in setupUI
var interactive, arc_group, line_group, text_group, notes_group;
var xOrigin, yOrigin;

const width = window.innerWidth;
const height = window.innerHeight * 0.9;

var flags = {
  generateInscribed: true, 
  theaterOnly: false,
  samePlanetPaths: false,
  samePlanetPathsOnHover: true,
  hideDuplicatesOnLeyline: false,
  showPowers: false
};

var planets;
var leylines;
var powers;
fetchData(() => {
  setupUI();
});

function main (planetA, planetB, distance) {
  const path = findPath();
  
  let x_coord = xOrigin - (getLabelWidth(planets[path[0]].full_name) / 2) - 20;
  path.forEach((planetName, i) => {
    let planet = planets[planetName];
    const label_width = getLabelWidth(planet.full_name);
    
    generatePlanet(planet, { x: x_coord + label_width / 2 + 20 });
    if (i > 0) {
      let next_planet = planets[path[i - 1]];
      generateLine(planet, next_planet, distances[planet.name][next_planet.name].distance);
    }
    
    x_coord += label_width + 20;
  });
  
  centerView();

  /*
  function generateStartingNeighbors () {
    const neighbors = getNeighbors(planet);
    
    const guiding_circle = interactive.circle(
      planet.point.x,
      planet.point.y,
      calculateRadius(neighbors.length));
    
    const circle_length = guiding_circle.getTotalLength();
    const increment_units = circle_length / neighbors.length;
    
    neighbors.forEach((p, i) => {
      const point = guiding_circle.getPointAtLength(increment_units * i);
      generatePlanet(p, { x: point.x, y: point.y });
    });
    
    guiding_circle.remove();
    
    const angle = 360 / neighbors.length;
    neighbors.forEach((p, i) => {
      generateNeighborsOnArc(p, i, angle, dist - 1);
    });
    
    function generateNeighborsOnArc (p, i, angle, dist) {
      if (dist < 1) { return; }
      
      const neighbors = getNeighbors(p);
      if (neighbors.length === 0) { return; }
      
      const radius = calculateRadius(Math.max(2, neighbors.length) * (360 / angle));
      const temp_circle = interactive.circle(planet.point.x, planet.point.y, radius);
      const circle_len = temp_circle.getTotalLength();
      const block_len = circle_len / (360 / angle);
      const arc_start = temp_circle.getPointAtLength(block_len * i);
      const arc_end = temp_circle.getPointAtLength(block_len * (i + 1));
      const path_value = `M ${arc_end.x} ${arc_end.y} A ${radius} ${radius} 0 0 0 ${arc_start.x} ${arc_start.y}`;
      temp_circle.remove();
      const temp_arc = interactive.path(path_value);
      const arc_len = temp_arc.getTotalLength();
      const arc_increment_units = arc_len / neighbors.length;
      
      neighbors.forEach((p, j) => {
        const point = temp_arc.getPointAtLength(arc_increment_units * j);
        generatePlanet(p, { x: point.x, y: point.y });
      });
      
      temp_arc.remove();
    }
    
    function calculateRadius (numPoints) {
      return Math.pow(Math.max(2, numPoints), 0.825) * 20;
    }
  }
  
  function generateNeighbors () {
    
  }
  */
  
  function findPath () {
    if (!planetB) { return [planetA.name]; }
    
    return [planetA.name]
      .concat(distances[planetA.name][planetB.name].path);
  }
  
  function generatePlanet (planet, settings) {
    if (planet.point) { return; }
    
    const x = (settings && settings.x) || xOrigin;
    const y = (settings && settings.y) || yOrigin;
    
    let control = interactive.control(x, y);
    
    let label = interactive.text(0, 0, planet.full_name);
    label.x -= label.getBoundingBox().width / 2;
    label.y -= label.getBoundingBox().height / 2;
    control.appendChild(label);
    
    planet.point = control;
  }
  
  function generateLine (planet1, planet2, distance) {
    let line = line_group.line(planet1.point.x, planet1.point.y, planet2.point.x, planet2.point.y);
    let text = notes_group.text(
      (line.x1 + line.x2) / 2,
      (line.y1 + line.y2) / 2,
      `${ (distance * 10000).toLocaleString('en-US') } em.`);
      
    $(text.root).addClass("note");
    
    text.x -= text.getBoundingBox().width / 2;
    text.y += text.getBoundingBox().height / 3;
    
    text.addDependency(line);
    
    text.update = () => {
      text.x = (line.x1 + line.x2) / 2 - text.getBoundingBox().width / 2;
      text.y = (line.y1 + line.y2) / 2 + text.getBoundingBox().height / 3;
    };
    
    line.addDependency(planet1.point);
    line.addDependency(planet2.point);
    
    line.update = () => {
      line.x1 = planet1.point.x;
      line.x2 = planet2.point.x;
      line.y1 = planet1.point.y;
      line.y2 = planet2.point.y;
    };
  }
  
  function getLabelWidth (str) {
    let temp_text = interactive.text(0, 0, str);
    let to_return = temp_text.getBoundingBox().width;
    temp_text.remove();
    return to_return;
  }
  
  function getNeighbors (planet) {
    let neighbor_lines = getLeylines().filter((l) => {
      return l.planets.some((p) => p.name === planet.name);
    });
    
    let neighbors = new Set;
    neighbor_lines.forEach((leyline) => {
      let prev_planet = planets[leyline.planets[leyline.planets.length - 1].name];
      leyline.planets.forEach((p, i) => {
        if (p.name !== planet.name) { return; }
          
        let next_planet = planets[(
          i === (leyline.planets.length - 1)
            ? leyline.planets[0]
            : leyline.planets[i + 1]).name];
          
        if (!prev_planet.point) { neighbors.add(prev_planet); }
        if (!next_planet.point) { neighbors.add(next_planet); }
        
        prev_planet = planets[p.name];
      });
    });
    
    return Array.from(neighbors);
  }
  
  function getCenterOfMass () {
    const all_planets = getPlanets();
    
    let num_created_planets = all_planets.reduce((total, planet) => { return total + (planets[planet.name].point ? 1 : 0); }, 0);
    if (num_created_planets === 0) { return { x: 0, y: 0 }; }
    
    let avg_x = all_planets.reduce((total, planet) => { return total + (planets[planet.name].point ? planets[planet.name].point.x : 0) }, 0) / num_created_planets;
    let avg_y = all_planets.reduce((total, planet) => { return total + (planets[planet.name].point ? planets[planet.name].point.y : 0) }, 0) / num_created_planets;
    
    return { x: avg_x, y: avg_y };
  }
  
  function centerView () {
    const avg = getCenterOfMass();
    
    const viewbox_parts = interactive.viewBox.split(' ');
    interactive.setViewBox(
      avg.x - viewbox_parts[2] / 2, avg.y - viewbox_parts[3] / 2,
      viewbox_parts[2],
      viewbox_parts[3]
    );
  }
}

let distances;
function setupUI () {
  xOrigin = width;
  yOrigin = height;
  let startingPlanet = planets["aeldrum"];
  let planetA, planetB, distance = 0;
  
  interactive = new Interactive("tree", {
    width: width,
    height: height,
    originX: 0,
    originY: 0
  });
  interactive.border = true;
  interactive.setViewBox(xOrigin / 2, yOrigin / 2, width, height);
  
  let grid_group = interactive.group();
  line_group = interactive.group();
  notes_group = interactive.group();
  
  calculateDistances(); 
  generateAxisLines();
  generateControls();
  
  function calculateDistances () {
    const planets = getPlanets();
    const planet_names = planets.map((p) => p.name);
    
    distances = {};
    
    // 1st-degree connections
    planet_names.forEach((name) => {
      distances[name] = {};
      const neighbors = getNeighbors(name);
      
      Object.keys(neighbors).forEach((neighborName) => {
        distances[name][neighborName] = {
          distance: neighbors[neighborName],
          path: [neighborName]
        };
      });
      
      planet_names.forEach((otherName) => {
        if (distances[name][otherName] && isFinite(distances[name][otherName].distance)) { return; }
        
        distances[name][otherName] = {
          distance: Infinity,
          path: [otherName]
        }
      });
    });
    
    // for(let k = 1; k <= n; k++){
    //   for(let i = 1; i <= n; i++){
    //     for(let j = 1; j <= n; j++){
    //         dist[i][j] = min( dist[i][j], dist[i][k] + dist[k][j] );
    //     }
    //   }
    // }
    
    planet_names.forEach((k) => {
      planet_names.forEach((i) => {
        planet_names.forEach((j) => {
          if ([i, j].includes(k) || i === j) { return; }
          
          if (distances[i][k].distance + distances[k][j].distance < distances[i][j].distance) {
            distances[i][j].distance = distances[i][k].distance + distances[k][j].distance;
            distances[i][j].path = distances[i][k].path.concat(distances[k][j].path);
          }
        });
      });
    });
    
    function getNeighbors (planetName) {
      let neighbor_lines = getLeylines().filter((l) => {
        return l.planets.some((p) => p.name === planetName);
      });
      
      let neighbors = {};
      neighbor_lines.forEach((leyline) => {
        let prev_planet = leyline.planets[leyline.planets.length - 1];
        leyline.planets.forEach((p, i) => {
          if (p.name !== planetName) { return; }
            
          let next_planet = (
            i === (leyline.planets.length - 1)
              ? leyline.planets[0]
              : leyline.planets[i + 1]);
            
          if (neighbors[prev_planet.name] === undefined
            || neighbors[prev_planet.name] > prev_planet.distance) {
              neighbors[prev_planet.name] = prev_planet.distance;
          }
          if (neighbors[next_planet.name] === undefined
            || neighbors[next_planet.name] > p.distance) {
              neighbors[next_planet.name] = p.distance;
          }
          
          prev_planet = p;
        });
      });
      
      return neighbors;
    }
  }
  
  function generateAxisLines () {
    let x = grid_group.line(-width, yOrigin, width * 3, yOrigin);
    let y = grid_group.line(xOrigin, -height, xOrigin, height * 3);
    x.style.stroke = "lightgrey";
    y.style.stroke = "lightgrey";
  }
  
  function generateControls () {
    
    const max_controls_width = $("#tree-controls").width();
    const max_controls_height = $("#tree-controls").height();
    
    generatePlanetSelectors();
    generateSlider();
    
    function generatePlanetSelectors () {
      let planet1, planet2;
      
      let selector1 = $("#planet1-selector");
      let selector2 = $("#planet2-selector");
      
      selector2.append(`<option value="">N/A</option>`);
      
      getPlanets()
        .sort((a, b) => {
          return a.full_name > b.full_name ? 1 : b.full_name > a.full_name ? -1 : 0;
        })
        .forEach(planet => {
          const option = `<option value="${ planet.name }">${ planet.full_name }</option>`;
          selector1.append(option);
          selector2.append(option);
        });
      selector1.val(startingPlanet.name);
      
      selector1.change((event) => {
        clearAll();
        planetA = planets[selector1.val()];
        reset();
      });
      
      selector2.change((event) => {
        clearAll();
        planetB = planets[selector2.val()];
        reset();
      });
      
      selector1.change();
    }
    
    function generateSlider () {
      let sliderInteractive = new Interactive("distance-slider", {
        width: max_controls_width,
        height: max_controls_height,
        originX: 0,
        originY: 0
      });
      
      let distance_slider = sliderInteractive.slider(10, 10, { min: 0, max: 2, step: 1, value: distance });
      
      let distance_slider_text = sliderInteractive.text(distance_slider.width + 25, 15);
      distance_slider_text.update = () => {
        distance_slider_text.contents = `${ Math.floor(distance_slider.value) }`;
      };
      distance_slider_text.update();
      
      distance_slider_text.addDependency(distance_slider);
      
      distance_slider.onchange = () => {
        const value = Math.floor(distance_slider.value);
        if (value === distance) { return; }
        
        clearAll();
        distance = value;
        reset();
        
        distance_slider.updateDependents();
      };
    }
  }
  
  function clearAll () {
    $("body").css("cursor", "wait !important");
    Object.keys(planets).map((i) => planets[i]).forEach((p) => {
      p.point && p.point.remove();
      delete p.point
      if (p.allPoints) {
        Object.keys(p.allPoints).forEach((leylineName) => {
          while (p.allPoints[leylineName].length > 0) {
            p.allPoints[leylineName].pop().remove();
          }
        });
      }
    });
    
    notes_group.clear();
    line_group.clear();
  }
  
  function reset () {
    main(planetA, planetB, distance);
  }
}

function fetchData (callback) {
  let timeframe = $('#timeframe-selector').val();

  $.ajax(`planets\\${timeframe}.json`, {
    dataType: "json",
    success: function (data) {
      planets = data;
      Object.keys(planets).forEach((name) => planets[name].name = name);
      
      $.ajax(`leylines\\${timeframe}.json`, {
        dataType: "json",
        success: function (data) {
          leylines = data;
          
          $.ajax(`powers\\${timeframe}.json`, {
            dataType: "json",
            success: function (data) {
              powers = data;
              Object.keys(powers).forEach((name) => powers[name].name = name);

              if (callback) callback.call();
            },
            error: function (xhr, status, err) {
              alert("Failed to download powers information!");
              console.log(err);
            }
          });
        },
        error: function (xhr, status, err) {
          alert("Failed to download leyline information!");
          console.log(err);
        }
      });
    },
    error: function (xhr, status, err) {
      alert("Failed to download planet information!");
      console.log(err);
    }
  });
}

function getLeylines () {
  return Object.keys(leylines)
    .map((i) => leylines[i]);
}

function getPlanets () {
  return Object.keys(planets)
    .map((i) => planets[i])
    .filter((p) => !p.skip);
}
