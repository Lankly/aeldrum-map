'use strict'
import Interactive from "https://vectorjs.org/interactive.js";

// Set in setupUI
var interactive, arc_group, circle_group, text_group;
var xOrigin, yOrigin;

const width = window.innerWidth;
const height = window.innerHeight * .9;

var flags = { 
  generateInscribed: true, 
  multigateOnly: false,
  samePlanetPaths: false,
  samePlanetPathsOnHover: true,
  hideDuplicatesOnLeyline: false
}

var planets;
var leylines;
$.ajax("planets.json", {
  dataType: "json",
  success: function (data) {
    planets = data;
    Object.keys(planets).forEach((name) => planets[name].name = name);
    
    $.ajax("leylines.json", {
      dataType: "json",
      success: function (data) {
        leylines = data;
        
        setupUI();
        main();
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

function main (focusPlanet) {
  circle_group = interactive.group();
  arc_group = interactive.group();
  text_group = interactive.group();
  
  focusPlanet = focusPlanet ?? planets["aeldrum"];
  
  let next_leyline = getNextLeyline({ startingPlanet: focusPlanet, size: 1 });
  
  generateCircularLeyline(next_leyline, { startingPlanet: focusPlanet });
  generateInscribableLeylines();
  
  // Perpendicular to starting point
  next_leyline = getNextLeyline({ startingPlanet: focusPlanet, minimizeConnections: next_leyline });
  if (next_leyline) {
    generateCircularLeyline(next_leyline, { startingPlanet: focusPlanet, makeNewControlPoints: true });
  }
  
  generateInscribableLeylines();
  
  generateOnePointIntersectionLeylines();
  
  // generateTwoPointIntersectionLeylines();
  
  generateNPointIntersectionLeylines();
  
  centerView();
  
  function generateOnePointIntersectionLeylines() {
    const generatedLeylines = Object.keys(leylines)
      .map((i) => leylines[i])
      .filter((l) => l.circle);
      
    let changed = false;
    generatedLeylines.forEach((leyline) => {
      let next_leyline;
      do {
        next_leyline = getNextLeyline({ startingLeyline: leyline, maxConnections: 1 });
        
        if (next_leyline) {
          const intersect_planet = next_leyline.planets.find(getPointFromPlanet);
          
          generateCircularLeyline(
            next_leyline,
            {
              startingPlanet: intersect_planet,
              startingLeyline: leyline,
              makeNewControlPoints: true
            });
          changed = true;
        }
      } while (next_leyline);
    });
    
    if (changed) { return generateOnePointIntersectionLeylines(); }
  }
  
  function generateTwoPointIntersectionLeylines() {
    do {
      next_leyline = getNextLeyline({ minConnections: 2, maxConnections: 2, noInscribed: true });
      
      if (next_leyline) {
        generateCircularLeylineWithTwoIntersections(next_leyline);
      }
    } while (next_leyline);
    
    function generateCircularLeylineWithTwoIntersections (leyline) {
      if (!leyline) { return; }
      
      let radius = calculateRadius(leyline);
      
      let intersecting_planets = leyline.planets
        .map((p) => getPointFromPlanet(p))
        .filter((p) => p);
        
      if (intersecting_planets.length !== 2) { return; }
        
      // Calculate possible centers for the circle
      let center_1 = calculateCenter(intersecting_planets[0], intersecting_planets[1], radius, false);
      let center_2 = calculateCenter(intersecting_planets[0], intersecting_planets[1], radius, true);
      
      // And take the one that's furthest from the center of mass
      let avg = getCenterOfMass();
      let distance_1 = getDistance(center_1, avg);
      let distance_2 = getDistance(center_2, avg);
      
      let center = (distance_1 < distance_2) ? center_1 : center_2;
      
      // Now figure out which direction to print the planets in        
      let num_planets_between_intersections_clockwise =
        leyline.planets.reduce((total, planet) => {
          if (planet.point) {
            if (total === 0) { return 1; }
            return -total;
          }
          if (total > 0) {
            return total + 1;
          }
        }, 0);
        
      let num_planets_between_intersections_counterclockwise =
        leyline.planets.reverse().reduce((total, planet) => {
          if (planet.point) {
            if (total === 0) { return 1; }
            return -total;
          }
          if (total > 0) {
            return total + 1;
          }
        }, 0);
        
      if (num_planets_between_intersections_counterclockwise < num_planets_between_intersections_clockwise) {
        leyline.planets = leyline.planets.reverse();
      }
      
      // Actually create the leyline
      let circle = circle_group.circle(center.x, center.y, radius);
      leyline.circle = circle;
      circle.fill = "transparent";
      circle.style.stroke = "black";
      
      // TODO
    }
    
    function calculateCenter(pointA, pointB, r, flip) {
      // Stolen from http://mathforum.org/library/drmath/view/53027.html
      let x1 = pointA.x;
      let x2 = pointB.x;
      let y1 = pointA.y;
      let y2 = pointB.y;
      let x3 = (x1+x2) / 2;
      let y3 = (y1+y2) / 2;
      
      let q = Math.sqrt(Math.pow((x2 - x1), 2) + Math.pow((y2 - y1), 2));
      
      let x_right_side = Math.sqrt(Math.pow(r, 2) - Math.pow((q / 2), 2)) * (y1 - y2) / q;
      let y_right_side = Math.sqrt(Math.pow(r, 2) - Math.pow((q / 2), 2)) * (x2 - x1) / q;
      
      let x;
      let y;
      if (flip) {
        x = x3 - x_right_side;
        y = y3 - y_right_side;
      }
      else {
        x = x3 + x_right_side;
        y = y3 + y_right_side;
      }
      
      return { x: x, y: y };
    }
  }
  
  function generateNPointIntersectionLeylines() {
    const min_space_between_leyline_edges = 100;
    
    let next_leyline;
    do {
      next_leyline = getNextLeyline({ minConnections: 3 });
      
      if (next_leyline) {
        generateNPointCircularLeyline(next_leyline);
      }
      
    } while (next_leyline);
    
    function generateNPointCircularLeyline (leyline) {
      const avg = getCenterOfMass();
      const generated_leylines = Object.keys(leylines)
        .map((i) => leylines[i])
        .filter((l) => l.circle);
      
      const radius = calculateRadius(leyline);
      
      // Center of mass  turned 90d around origin
      // let x = xOrigin + (avg.y - yOrigin);
      // let y = yOrigin + (avg.x - xOrigin);
      // Opposite of center of mass
      let x = xOrigin - (avg.x - xOrigin);
      let y = yOrigin - (avg.y - yOrigin);
      
      let circle = circle_group.circle(x, y, radius);
      leyline.circle = circle;
      
      let invalid;
      let tick = 0;
      const padding = 30;
      do {
        ++tick;
        invalid = generated_leylines
          .filter((l) => {
            const distance = getDistance(l.circle, circle);
            const in_range = distance <= (l.circle.r + radius + padding);
            
            return in_range;
          })
          .reduce((closest, l) => {
            if (!closest) { return l; }
            
            const distance = getDistance(l.circle, circle);
            const closest_distance = getDistance(closest.circle, circle);
            
            if (distance < closest_distance) {
              return l;
            }
            
            return closest;
          }, null);
        
        if (invalid) {
          repositionCircle(circle, invalid.circle, tick);
        }
      } while (invalid);
      
      let coords = { x: circle.cx, y: circle.cy };
      circle.remove();
      
      generateCircularLeyline(leyline, {
        centerCoord: coords,
        makeNewControlPoints: true
      });
      
      generateInscribableLeylines();
    }
  }
  
  function generateInscribableLeylines() {
    if (!flags.generateInscribed) { return; }
    
    let generated_leylines = Object.keys(leylines).map(i => leylines[i]).filter((l) => l.circle);
    
    generated_leylines.forEach((leyline) => {
      let prev_circle = leyline.circle;
      
      next_leyline = getNextNestedLeyline(leyline, prev_circle.r, 2);
      if (!next_leyline) { return; }
      
      let planetNames = leyline.planets.map((p) => p.name);
      let overlap_planet_index = next_leyline.planets.findIndex((p) => planetNames.includes(p.name));
      
      let rotatePercent = 0;
      if (overlap_planet_index !== -1) {
        const circumference = leyline.circle.getTotalLength();
        const planet_name = next_leyline.planets[overlap_planet_index].name;
        const outer_index = leyline.planets.findIndex((p) => p.name === planet_name);
        const planet_point = getPointFromPlanet(leyline.planets[outer_index]);
        
        const inner_point_index = getPlanetPointIndex(next_leyline, overlap_planet_index);
        const inner_point_total = getPlanetPointTotal(next_leyline);
        
        const inner_starting_rotation = inner_point_index / inner_point_total - 0.25; // The .25 accounts for the fact that we force the starting point to the top
        
        let outer_rotation = 0.5;
        for (let i = 0; i < 10; ++i) {
          const multiplier = Math.pow(0.5, i + 2);
          const right_rotation = outer_rotation + multiplier;
          const left_rotation = outer_rotation - multiplier;
          
          const right_point = leyline.circle.getPointAtLength(circumference * right_rotation);
          const left_point = leyline.circle.getPointAtLength(circumference * left_rotation);
          
          const right_dist = getDistance(planet_point, right_point);
          const left_dist = getDistance(planet_point, left_point);
          
          if (right_dist < left_dist) {
            outer_rotation = right_rotation;
          }
          else if (left_dist < right_dist) {
            outer_rotation = left_rotation;
          }
        }
        
        rotatePercent = outer_rotation - inner_starting_rotation;
      }
      
      generateCircularLeyline(
        next_leyline,
        {
          centerCoord: prev_circle,
          rotatePercent: rotatePercent,
          makeNewControlPoints: true
        });
      next_leyline.inscribing_leyline = leyline;
    });
    
    function getNextNestedLeyline (startingLeyline, radius, maxConnections) {
      if (!startingLeyline) { return; }
      
      const starting_leyline_already_inscribed = Object.keys(leylines)
        .find((i) => leylines[i].inscribing_leyline === startingLeyline);
      if (starting_leyline_already_inscribed) { return; }
      
      const starting_leyline_names = startingLeyline.planets.map((p) => p.name);
      const min_radius = 80;
      const too_close_min = radius * 0.8;
      let best;
      
      Object.keys(leylines).map((i) => leylines[i]).filter((l) => !l.circle).forEach((leyline) => {
        // Make sure this leyline only has a valid number of connections to the starting leyline
        let connections = leyline.planets.reduce((total, planet) => { return total + (starting_leyline_names.includes(planet.name) ? 1 : 0); }, 0);
        if (connections > maxConnections) { return; }
        
        // There should also be no other outside connections
        connections = leyline.planets.reduce((total, planet) => { return total + (getPointFromPlanet(planet) ? 1 : 0); }, 0);
        if (connections > maxConnections) { return; }
        
        let cur_radius = calculateRadius(leyline);
        if (cur_radius < min_radius
          || cur_radius > too_close_min) {
            return;
        }
        
        if (!best || (leyline.planets.length > best.planets.length)) {
          best = leyline;
        }
      });
      
      return best;
    }
  }
  
  function generateCircularLeyline (leyline, settings) {
    let startingPlanet = settings && settings.startingPlanet;
    let startingLeyline = settings && settings.startingLeyline;
    let centerCoord = settings && settings.centerCoord;
    let rotatePercent = settings && settings.rotatePercent;
    let makeNewControlPoints = settings && settings.makeNewControlPoints;
    let noDuplicatesOnLine = flags.hideDuplicatesOnLeyline;
    
    // Create the leyline
    let radius = calculateRadius(leyline);
    let circle = circle_group.circle(xOrigin, yOrigin + radius, radius);
    leyline.circle = circle;
    
    if (startingPlanet && getPointFromPlanet(startingPlanet)) {
      let starting_point = getPointFromPlanet(startingPlanet, /* firstPoint= */true);
      circle.cx = starting_point.x;
      circle.cy = starting_point.y;

      repositionCircle(circle, startingLeyline ? startingLeyline.circle : getCenterOfMass());
    }
    
    if (centerCoord) {
      circle.cx = centerCoord.cx ?? centerCoord.x;
      circle.cy = centerCoord.cy ?? centerCoord.y;
    }
    
    circle.fill = "transparent";
    if (leyline.color) { circle.style.stroke = leyline.color; }
    
    let total = leyline.planets.length;
    let total_points = new Set(leyline.planets.map((p) => p.name)).size;
    if (!noDuplicatesOnLine) {
      let seen_this = new Set();
      total_points += leyline.planets.reduce((dups, planet) => {
        dups += seen_this.has(planet.name);
        
        seen_this.add(planet.name);
        
        return dups;
      }, 0); 
    }
    
    // Add each planet to the leyline
    let i = startingPlanet ? leyline.planets.findIndex((planet) => planet.name == startingPlanet.name) : 0;
    let point_index = 0;
    let seen_planets = new Set();
    for (let j = 0; j < leyline.planets.length; ++j, ++i) {
      if (point_index >= total_points) { point_index = 0; }
      
      let planetData = leyline.planets[i % total];
      
      const point_already_exists = planets[planetData.name].point;
      if (point_already_exists) {
        if (!seen_planets.has(planetData.name)) {
          seen_planets.add(planetData.name);
          
          if (!makeNewControlPoints) {
            ++point_index;
          }
        }
        else if (noDuplicatesOnLine) {
          continue;
        }
        
        if (!makeNewControlPoints && noDuplicatesOnLine) {
          continue;
        }
      }
      
      let planet_point = createControlPointOnCircle(
        circle,
        point_index,
        total_points,
        {
          startingPoint: getPointFromPlanet(startingPlanet),
          rotatePercent: rotatePercent
        });
      
      circle.addDependency(planet_point);
      
      // Add the planet_point's name above it
      let planet_name = planets[planetData.name].full_name;
      let planet_text = text_group.text(planet_point.x, planet_point.y - 10, planet_name);
      planet_text.x = planet_text.x - (planet_text.getBoundingBox().width / 2);
      planet_text.style.stroke = "white";
      planet_text.style["stroke-width"] = 5;
      $(planet_text.root).addClass(planetData.name);
      
      const previous_planet_name = leyline.planets[((i > 0 ? i : total) - 1) % total].name;
      const next_planet_name = leyline.planets[(i + 1) % total].name;
      $(planet_text.root).addClass(`neighbor-${ previous_planet_name }`);
      $(planet_text.root).addClass(`neighbor-${ next_planet_name }`);
      planet_point.addDependency(planet_text);
      
      if (point_already_exists && makeNewControlPoints) {
        if (!planets[planetData.name].extra_points) { planets[planetData.name].extra_points = []; }
        
        planets[planetData.name].extra_points.push(planets[planetData.name].point);
      }
      planets[planetData.name].point = planet_point;
      
      if (planets[planetData.name].group) {
        $(planet_text.root).addClass("group-planet");
      }
      
      // Click behavior
      let clickdown = false;
      $(planet_point.root).mousedown(() => {
        clickdown = true;
      });
      $(planet_point.root).mouseup(() => {
        if (!clickdown) { return; }
        
        clickdown = false;
        recenterOnPlanet(planets[planetData.name]);
      });
        
      // Hover behavior
      $(planet_point.root).mouseenter(() => {
        if (flags.samePlanetPaths || flags.samePlanetPathsOnHover) {
          $(`g.${planetData.name}`).addClass("path-highlight");
        }
        
        let planet_labels = $(`text.${ planetData.name }`);
        planet_labels.addClass("font-highlight");
        
        let neighbor_labels = $(`text.neighbor-${ planetData.name }`);
        neighbor_labels.addClass("font-neighbor-highlight");
        
        let hover_planet_label = $(planet_text.root);
        
        let text_dom_group = planet_labels.parent();
        planet_labels.detach();
        neighbor_labels.detach();
        hover_planet_label.detach();
        text_dom_group.append(planet_labels);
        text_dom_group.append(neighbor_labels);
        text_dom_group.append(hover_planet_label);
      });
      $(planet_point.root).mouseleave(() => {
        $(`g.${ planetData.name }`).removeClass("path-highlight");
        $(`text.${ planetData.name }`).removeClass("font-highlight");
        $(`text.neighbor-${ planetData.name }`).removeClass("font-neighbor-highlight");
        clickdown = false;
      });
      
      seen_planets.add(planetData.name);
      ++point_index;
    }
    
    // Add the arcs between each planet individually
    const planet_occurrences = leyline.planets
      .reduce((obj, p) => { obj[p.name] = (obj[p.name] ?? 0) + 1; return obj }, {});
    let previous_planet_point;
    leyline.planets.forEach((planetData, i) => {
      if (planet_occurrences[planetData.name] === undefined) { 
        planet_occurrences[planetData.name] = 0;
      }
      --planet_occurrences[planetData.name];
      
      const extra_points = planets[planetData.name].extra_points;
      
      let planet_point = getPointFromPlanet(planetData, /* firstPoint= */ !makeNewControlPoints);
      if (!noDuplicatesOnLine
        && planet_occurrences[planetData.name] > 0
        && extra_points
        && extra_points.length > 0) {
          planet_point = extra_points[extra_points.length - planet_occurrences[planetData.name]];
      }
      
      let previous_planet = leyline.planets[i === 0 ? total - 1 : i - 1];
      previous_planet_point = previous_planet_point ?? getPointFromPlanet(previous_planet);
      
      
      let arc = createArc(circle, planet_point, previous_planet_point);
      let title = document.createElementNS($("#map > svg").attr("xmlns"), "title");
      title.textContent = `Distance: ~${(previous_planet.distance * 10000).toLocaleString('en-US')} etheric miles`;
      $(arc.root).append(title);
      $(arc.root).addClass(planetData.name);
      $(arc.root).addClass(previous_planet.name);
      if (previous_planet.distance === '?') {
        title.textContent = "Distance unknown";
        $(arc.root).find(".foreground-path").css("stroke", `url(#gradient-${leyline.aeldman_name})`);
      }
      circle.addDependency(arc);
      
      if (extra_points) {
        extra_points.forEach((extra_point) => {
          arc = createArc(circle, planet_point, extra_point);
          $(arc.root).addClass("same-planet-path");
          $(arc.root).addClass(planetData.name);
        });
      }
      
      previous_planet_point = planet_point;
    });
      
    circle.style.stroke = "transparent";
  }
  
  function createControlPointOnCircle (circle, index, total_points, settings) {
    let startingPoint = settings && settings.startingPoint;
    let rotatePercent = (settings && settings.rotatePercent) || 0;
    
    rotatePercent = rotatePercent ?? 0;
    const circle_len = circle.getTotalLength();
    const circle_units = circle_len / total_points;
    const offset_to_top = circle_len * 3 / 4;
    let offset_to_start;
    if (startingPoint) {
      offset_to_start = circle.r * (360 - getAngle(startingPoint, { x: circle.cx, y: circle.cy })) * Math.PI / 180;
    }
    
    const offset = offset_to_start ?? offset_to_top;
    const rotate_amount = (circle_len * rotatePercent);
    
    let dist_xy = circle.getPointAtLength(
      (index * circle_units + offset + rotate_amount) % circle_len);
    
    // Create the planet as a control point
    let planet_control_point = interactive.control(dist_xy.x, dist_xy.y);
    planet_control_point.constrainWithinBox(planet_control_point.x, planet_control_point.y, planet_control_point.x, planet_control_point.y);
    planet_control_point.onchange = function () { resetToPoint(planet_name); };
    
    return planet_control_point;
  }
  
  function getNextLeyline (settings) {
    let startingPlanet = settings && settings.startingPlanet;
    let startingLeyline = settings && settings.startingLeyline;
    let minConnections = (settings && settings.minConnections) ?? 0;
    let maxConnections = (settings && settings.maxConnections) ?? Number.MAX_SAFE_INTEGER;
    let noInscribed = settings && settings.noInscribed;
    let size = settings && settings.size; // -1 for min, 0 for middle, 1 for max
    let minimizeConnections = settings && settings.minimizeConnections; // This should be a leyline
    if (size !== undefined && minimizeConnections !== undefined) {
      return alert("Cannot filter leylines by both size and connections.");
    }
    
    let possible = [];
    
    Object.keys(leylines).map((i) => leylines[i]).forEach((leyline) => {
      // Leyline has already been generated
      if (leyline.circle) { return; }
      
      // Make sure this leyline only has a valid number of connections on the current state
      let connections = leyline.planets.reduce((total, planet) => { return total + (getPointFromPlanet(planet) ? 1 : 0); }, 0);
      if (connections > maxConnections || connections < minConnections) { return; }
      
      // Leyline must contain the starting planet, if provided
      let containsPlanet = !startingPlanet || leyline.planets.some((planet) => { return planet.name == startingPlanet.name; });
      if (!containsPlanet) { return; }
      
      // Leyline must intersect the starting leyline, if provided
      if (startingLeyline) {
        const leyline_names = leyline.planets.map((p) => p.name);
        const intersects = startingLeyline.planets
          .map((p) => p.name)
          .some((name) => leyline_names.includes(name));
        
        
        if (!intersects) { return; }
      }
      
      // And none of them can be from an inscribed leyline
      if (noInscribed) {
        let planetNames = leyline.planets.map((p) => p.name);
        let inscribed = Object.keys(leylines)
          .map((i) => leylines[i])
          .filter((l) => l.inscribing_leyline)
          .some((inscribed) => inscribed.planets.some((p) => planetNames.includes(p.name)));
        if (inscribed) { return; }
      }
      
      possible.push(leyline);
    });
    
    if (possible.length === 0) { return; }
    
    possible = possible.sort((a, b) => a.planets.length - b.planets.length);
    
    if (minimizeConnections) {
      const planet_names = minimizeConnections.planets.map((p) => p.name);
      
      possible.sort((a, b) => getConnections(a) - getConnections(b));
      return possible[0];
      
      function getConnections (leyline) {
        return leyline.planets.reduce((count, p) => {
          return count + (planet_names.includes(p.name) ? 1 : 0);
        }, 0);
      }
    }
    
    switch (size) {
      case -1:
        return possible[0];
      case 0:
        return possible[Math.floor(possible.length / 2)];
      default:
        return possible[possible.length - 1];
    }
  }
  
  function getNextLeylineByLeyline (startingLeyline, maxConnections) {
    if (!startingLeyline) { return; }
    
    let best;
    let startingLeylinePlanets = startingLeyline.planets.map((p) => p.name);
    
    Object.keys(leylines).map((i) => leylines[i]).forEach((leyline) => {
      if (leyline.circle) { return; }
      
      // Make sure this leyline only has a valid number of connections on the current state
      let connections = leyline.planets.reduce((total, planet) => { return total + (getPointFromPlanet(planet) ? 1 : 0); }, 0);
      let connectionsOnLeyline = leyline.planets.reduce((total, planet) => { return total + (startingLeylinePlanets.includes(planet.name) ? 1 : 0); }, 0);
      if (connections !== connectionsOnLeyline || connections > maxConnections) { return; }
      
      if (!best || best.planets.length < leyline.planets.length) {
        best = leyline;
      }
    });
    
    return best;
  }
  
  function repositionCircle (circle, guidingPoint, distance) {
    distance = distance ?? circle.r;
    let point = { x: guidingPoint.cx ?? guidingPoint.x, y: guidingPoint.cy ?? guidingPoint.y };
    
    let scale_factor = distance / Math.sqrt(Math.pow(circle.cx - point.x, 2) + Math.pow(circle.cy - point.y, 2));
    let offset_x = scale_factor * (circle.cx - point.x);
    let offset_y = scale_factor * (circle.cy - point.y);
    
    circle.translate(offset_x, offset_y);
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
  
  function getPointFromPlanet (planet, firstPoint) {
    if (firstPoint && planet && planet.extra_points && planet.extra_points.length > 0) {
      return planet.extra_points[0];
    }
    
    if (planet && planet.point) {
      return planet.point;
    }
    
    if (planet && planet.name) {
      if (!planets[planet.name]) { alert(`Missing data for planet: ${planet.name}`); }
      
      if (firstPoint && planets[planet.name].extra_points && planets[planet.name].extra_points.length > 0) {
        return planets[planet.name].extra_points[0];
      }
      
      return planets[planet.name].point;
    }
  }
  
  function getCenterOfMass () {
    let num_created_planets = Object.keys(planets).reduce((total, name) => { return total + (planets[name].point ? 1 : 0); }, 0);
    let avg_x = Object.keys(planets).reduce((total, name) => { return total + (planets[name].point ? planets[name].point.x : 0) }, 0) / num_created_planets;
    let avg_y = Object.keys(planets).reduce((total, name) => { return total + (planets[name].point ? planets[name].point.y : 0) }, 0) / num_created_planets;
    
    return { x: avg_x, y: avg_y };
  }
  
  function getPlanetPointTotal (leyline) {
    let seen = new Set();
    
    for (let i = 0; i < leyline.planets.length; ++i) {
      seen.add(leyline.planets[i].name);
    }
    
    return seen.size;
  }
  
  function getPlanetPointIndex (leyline, planetIndex) {
    let seen = new Set();
    
    for (let i = 0; i < planetIndex; ++i) {
      seen.add(leyline.planets[i].name);
    }
    
    return seen.size;
  }
  
  function calculateRadius (leyline) {
    return Math.pow(leyline.planets.length, .825) * 20;
  }
  
  function getDistance(pointA, pointB) {
    const a = { x: pointA.cx ?? pointA.x, y: pointA.cy ?? pointA.y };
    const b = { x: pointB.cx ?? pointB.x, y: pointB.cy ?? pointB.y };
    
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
  }
  
  function createArc (circle, pointA, pointB) {  
    const path_value = `M ${pointA.x} ${pointA.y} A ${circle.r} ${circle.r} 0 0 0 ${pointB.x} ${pointB.y}`;
    
    let arc_pair = arc_group.group();
    let background_path = arc_pair.path(path_value);
    $(background_path.root).addClass("background-path");
    
    let path = arc_pair.path(path_value);
    path.style.fill = "none";
    path.style.stroke = circle.style.stroke;
    $(path.root).addClass("foreground-path");
    
    return arc_pair;
  }
}

let recenterOnPlanet;
function setupUI () {
  xOrigin = width;
  yOrigin = height;
  let startingPlanet = planets["aeldrum"];
  
  interactive = new Interactive("map", {
    width: width,
    height: height,
    originX: 0,
    originY: 0
  });
  interactive.border = true;
  interactive.setViewBox(xOrigin / 2, yOrigin / 2, width, height);
  
  setupGradient();
  generateAxisLines();
  handlePanning();
  let zoom_slider = generateZoomSlider();
  generateLeylineCheckboxes();
  generateAdditionalControls();
  
  function generateLeylineCheckboxes () {
    const total_leylines = Object.keys(leylines).length;
    const box_padding = 30;
    const padding_between = 20;
    const controls_height = 18;
    const widest_text = Object.keys(leylines).map((i) => leylines[i]).reduce((max, l) => { return Math.max(max, l.aeldman_name.length); }, 0);
    const control_box_height = box_padding * 2 + ((total_leylines - 1) * (padding_between + controls_height));
    const controls_width = widest_text * 10 + 2 * box_padding;
    
    let checkboxes = new Interactive("leyline-checkboxes", {
      width: controls_width,
      height: control_box_height,
      originX: 0,
      originY: 0
    });
    checkboxes.border = true;
    let background = checkboxes.rectangle(0, 0, controls_width, control_box_height);
    background.fill = "white";
    
    Object.keys(leylines).forEach((leylineNumber, i) => {
      let leyline = leylines[leylineNumber];
      
      let checkbox = checkboxes.checkBox(
        box_padding,
        box_padding + i * (padding_between + controls_height),
        leyline.aeldman_name,
        /* enabled= */ true);
        
      checkbox.box.fill = leyline.color;
      checkbox.box.style.stroke = leyline.darker_color;
        
      checkbox.onchange = () => {
        clearAll();
        if (checkbox.value) {
          leylines[leylineNumber] = leyline;
          checkbox.box.fill = leyline.color;
        }
        else {
          delete leylines[leylineNumber];
        }
        reset();
      }
      
      $(checkbox.label.root).click(() => { checkbox.toggle(); });
      
    });
  }
  
  function generateAdditionalControls () {
    const width = 210,
      height = 200, // This should match one of the values in the CSS for this interactive
      padding = 30,
      distance_between = 38;
    
    const additionalInteractive = new Interactive("additional-controls", {
      width: width,
      height: height,
      originX: 0,
      originY: 0
    });
    additionalInteractive.border = true;
    
    let background = additionalInteractive.rectangle(0, 0, width, height);
    background.fill = "white";
    
    let flag_index = 0;
    
    let inscribable = additionalInteractive.checkBox(padding, padding + distance_between * flag_index, "Generate inscribed", flags.generateInscribed);
    inscribable.onchange = () => {
      flags.generateInscribed = inscribable.value;
      clearAll();
      reset();
    }
    ++flag_index;
    
    let multigateOnly = additionalInteractive.checkBox(padding, padding + distance_between * flag_index, "Multigate only", flags.multigateOnly);
    let multigateOnlySavedData = {};
    multigateOnly.onchange = () => {
      flags.multigateOnly = multigateOnly.value;
      clearAll();
      
      if (multigateOnly.value === true) {
        const leyline_planet_names = Object.keys(leylines)
          .map((i) => leylines[i])
          .reduce((arr, leyline) => { return arr.concat(leyline.planets.map((p) => p.name)); }, []);
          
        let planet_counts = {};
        leyline_planet_names.forEach((name) => planet_counts[name] = (planet_counts[name] ?? 0) + 1);
        
        Object.keys(leylines).forEach((i) => {
          let leyline = leylines[i];
          
          if (!multigateOnlySavedData[i]) {
            multigateOnlySavedData[i] = [];
          }
          
          multigateOnlySavedData[i] = multigateOnlySavedData[i].concat(leyline.planets);
          leyline.planets = leyline.planets.filter((p) => planet_counts[p.name] > 1);
        });
      }
      else {
        Object.keys(leylines).forEach((i) => {
          if (leylines[i]) {
            leylines[i].planets = multigateOnlySavedData[i];
            delete multigateOnlySavedData[i];
          }
        });
      }
      
      reset();
    }
    ++flag_index;
    
    let same_planet_paths = additionalInteractive.checkBox(padding, padding + distance_between  * flag_index, "Show all paths", flags.samePlanetPaths);
    let rule_index = 0;
    same_planet_paths.onchange = () => {
      const rule = ".same-planet-path { display: none; }";
      
      flags.samePlanetPaths = same_planet_paths.value;
      
      if (same_planet_paths.value) {
        document.styleSheets[0].deleteRule(rule_index);
      } else {
        rule_index = document.styleSheets[0].insertRule(rule, rule_index);
      }
    }
    same_planet_paths.onchange();
    flag_index += 0.75;
    
    let same_planet_paths_on_hover = additionalInteractive.checkBox(padding * 2, padding + distance_between * flag_index, "On hover", flags.samePlanetPathsOnHover);
    same_planet_paths_on_hover.onchange = () => {
      flags.samePlanetPathsOnHover = same_planet_paths_on_hover.value;
    };
    flag_index += 0.9;
    
    let no_duplicates = additionalInteractive.checkBox(padding, padding + distance_between * flag_index, "Allow inner loops", flags.hideDuplicatesOnLeyline);
    no_duplicates.onchange = () => {
      flags.hideDuplicatesOnLeyline = no_duplicates.value;
      
      clearAll();
      reset();
    };
    ++flag_index;
    
    [inscribable, multigateOnly, same_planet_paths, no_duplicates].forEach((checkbox) => {
      $(checkbox.label.root).click(() => { checkbox.toggle(); });
    });
  }
  
  function generateZoomSlider () {
    const slider_width = width / 4;
    const slider_text_width = 65;
    const slider_default_value = 1;
    const max_zoom = 2;
    const min_zoom = .25;
    
    const sliderInteractive = new Interactive("zoom-slider", {
      width: slider_width + slider_text_width,
      height: 30,
      originX: 0,
      originY: 0
    });
    
    let slider = sliderInteractive.slider(10, 20, { min: min_zoom, max: max_zoom, value: slider_default_value, width: slider_width } );    
    slider.onchange = () => {
      const viewbox_parts = interactive.viewBox.split(' ');
      
      const old_width = viewbox_parts[2];
      const old_height = viewbox_parts[3];
      const new_width = width / slider.value;
      const new_height = height / slider.value;
      
      const width_diff = new_width - old_width;
      const height_diff = new_height - old_height;
      
      interactive.setViewBox(
        parseInt(viewbox_parts[0]) - width_diff / 2,
        parseInt(viewbox_parts[1]) - height_diff / 2,
        new_width > 0 ? Math.ceil(new_width) : Math.floor(new_width),
        new_height > 0 ? Math.ceil(new_height) : Math.floor(new_height)
      );
      
      slider.updateDependents();
    };
    
    let slider_text = sliderInteractive.text(slider_width + 20, 25);
    slider_text.update = () => { slider_text.contents = `${ Math.floor(slider.value * 100) }%`; };
    slider_text.update();
    
    slider_text.addDependency(slider);
    
    return slider;
  }
  
  function generateAxisLines () {
    let x = interactive.line(-width, yOrigin, width * 3, yOrigin);
    let y = interactive.line(xOrigin, -height, xOrigin, height * 3);
    x.style.stroke = "lightgrey";
    y.style.stroke = "lightgrey";
  }
  
  function setupGradient () {
    let defs = interactive.defs();
    const ns = $("#map > svg").attr("xmlns");
    
    Object.keys(leylines).map((i) => leylines[i]).forEach((leyline) => {
      let linearGradient = $(document.createElementNS(ns, "linearGradient"));
      linearGradient.attr("id", `gradient-${leyline.aeldman_name}`);
      
      let stop1 = $(document.createElementNS(ns, "stop"));
      stop1.attr("offset", "0%");
      stop1.attr("stop-opacity", 1);
      stop1.attr("stop-color", leyline.color);
      let stop2 = $(document.createElementNS(ns, "stop"));
      stop2.attr("offset", "50%");
      stop2.attr("stop-opacity", 0);
      stop2.attr("stop-color", leyline.color);
      let stop3 = $(document.createElementNS(ns, "stop"));
      stop3.attr("offset", "100%");
      stop3.attr("stop-opacity", 1);
      stop3.attr("stop-color", leyline.color);
      
      linearGradient.append(stop1);
      linearGradient.append(stop2);
      linearGradient.append(stop3);
      $(defs.root).append(linearGradient);
    });
  }
  
  recenterOnPlanet = function (planet) {
    clearAll();
    startingPlanet = planet;
    reset();
  }
  
  function clearAll () {
    Object.keys(planets).map((i) => planets[i]).forEach((p) => {
      p.point && p.point.remove();
      delete p.point
      if (p.extra_points) {
        while (p.extra_points.length > 0) {
          p.extra_points.pop().remove();
        }
      }
    });
    Object.keys(leylines).map((i) => leylines[i]).forEach((l) => {
      l.circle && l.circle.remove();
      delete l.circle;
      delete l.inscribing_leyline;
    });
    
    arc_group.clear(); arc_group.remove();
    text_group.clear(); text_group.remove();
  }
  
  function reset () {
    main(startingPlanet);
  }
  
  function handlePanning () {
    let panning;
    
    $("body").bind("mousewheel", scrollHandler);
    $("#map").bind("mousedown", startPan);
    $("body").bind("mouseup", stopPan);
    $("body").bind("mouseleave", stopPan);
    $("body").bind("mousemove", pan);
    
    
    function startPan (event) {
      panning = { x: event.clientX, y: event.clientY };
      
      document.body.style.cursor = "all-scroll";
    }
    
    function stopPan (event) {
      panning = false;
      
      document.body.style.cursor = "inherit";
    }
    
    function pan (event) {
      if (!panning) { return; }
      
      let delta_x = (panning.x - event.clientX) / zoom_slider.value;
      let delta_y = (panning.y - event.clientY) / zoom_slider.value;
      
      let viewbox_parts = interactive.viewBox.split(' ');
      
      interactive.setViewBox(
        Math.min(width, Math.max(-width, parseInt(viewbox_parts[0]) + delta_x)),
        Math.min(height, Math.max(-height, parseInt(viewbox_parts[1]) + delta_y)),
        parseInt(viewbox_parts[2]),
        parseInt(viewbox_parts[3]));
      
      startPan(event);
    }
  }
  
  function scrollHandler (event) {
    return;
    let x = event.clientX - interactive.root.getBoundingClientRect().left;
    let y = event.clientY - interactive.root.getBoundingClientRect().top;
    
    let scroll_amount = event.deltaY * 10;
    
    interactive.setViewBox(
      width / 2 - x,
      height / 2 - y,
      interactive.width + scroll_amount,
      interactive.height + scroll_amount);
  }
}

function getAngle(reference, control) {
  let angle = Math.abs(Math.atan2(control.y - reference.y, reference.x - control.x));
  
  if ((control.y - reference.y) > 0) {
      angle = Math.PI * 2 - angle;
  }
  
  return (360 - (angle * 180 / Math.PI)).toFixed(1);
}
