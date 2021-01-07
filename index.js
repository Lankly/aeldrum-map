'use strict'
import Interactive from "https://vectorjs.org/interactive.js";

// Set in setupUI
var interactive, arc_group, circle_group, text_group, notes_group;
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
$.ajax("planets.json", {
  dataType: "json",
  success: function (data) {
    planets = data;
    Object.keys(planets).forEach((name) => planets[name].name = name);
    
    $.ajax("leylines.json", {
      dataType: "json",
      success: function (data) {
        leylines = data;
        
        $.ajax("powers.json", {
          dataType: "json",
          success: function (data) {
            powers = data;
            Object.keys(powers).forEach((name) => powers[name].name = name);
        
            setupUI();
            main();
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

function main (focusPlanet) {
  let hold_highlight = new Set();
  
  focusPlanet = focusPlanet ?? planets["aeldrum"];
  
  let starting_leyline = getNextLeyline({ startingPlanet: focusPlanet, size: 1 });
  let next_leyline = starting_leyline;
  if (!next_leyline) {
    return alert(`${ planets[focusPlanet.name].full_name } does not exist on any available leylines.`);
  }
  
  generateCircularLeyline(next_leyline, { startingPlanet: focusPlanet });
  generateInscribableLeylines();
  
  // Perpendicular to starting point
  let previous_leyline = next_leyline;
  next_leyline = getNextLeyline({
    startingPlanet: focusPlanet,
    minimizeConnections: next_leyline,
    noInscribed: true,
  });
  if (next_leyline) {
    generateCircularLeyline(next_leyline, {
      startingPlanet: focusPlanet,
      startingPlanetLeyline: starting_leyline,
      makeNewControlPoints: true,
    });
  }
  
  generateInscribableLeylines();
  
  // generateOnePointIntersectionLeylines();
  
  generateRemainingLeylines();
  
  centerView();
  $( document ).tooltip();
  
  function generateOnePointIntersectionLeylines() {
    const generatedLeylines = getLeylines().filter((l) => l.circle);
      
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
  
  function generateRemainingLeylines() {
    const min_space_between_leyline_edges = 100;
    
    let next_leyline;
    do {
      next_leyline = getNextLeyline();
      
      if (next_leyline) {
        generateUnconnectedCircularLeyline(next_leyline);
        generateInscribableLeylines();
      }
      
    } while (next_leyline);
    
    function generateUnconnectedCircularLeyline (leyline) {
      const avg = getCenterOfMass();
      const generated_leylines = getLeylines().filter((l) => l.circle);
      
      const radius = calculateRadius(leyline);
      
      // Opposite of center of mass
      let x = xOrigin - (avg.x - xOrigin);
      let y = yOrigin - (avg.y - yOrigin);
      
      let circle = circle_group.circle(x, y, radius);
      leyline.circle = circle;
      
      const padding = 30;
      for (let invalid = true, tick = 0; invalid; ++tick) {
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
      }
      
      let coords = { x: circle.cx, y: circle.cy };
      circle.remove();
      
      generateCircularLeyline(leyline, {
        centerCoord: coords,
        makeNewControlPoints: true
      });
    }
  }
  
  function generateInscribableLeylines() {
    if (!flags.generateInscribed) { return; }
    
    let generated_leylines = getLeylines().filter((l) => l.circle);
    
    generated_leylines.forEach((leyline) => {
      let prev_circle = leyline.circle;
      
      next_leyline = getNextNestedLeyline(leyline, prev_circle.r, 2);
      if (!next_leyline) { return; }
      
      let planetNames = leyline.planets.map((p) => p.name);
      let overlap_planet_index = next_leyline.planets.findIndex((p) => planetNames.includes(p.name));
      
      let rotatePercent = 0;
      if (overlap_planet_index !== -1 && (!flags.theaterOnly || next_leyline.planets[overlap_planet_index].theater)) {
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
      
      next_leyline.inscribing_leyline = leyline;
      generateCircularLeyline(
        next_leyline,
        {
          centerCoord: prev_circle,
          rotatePercent: rotatePercent,
          makeNewControlPoints: true
        });
    });
    
    function getNextNestedLeyline (startingLeyline, radius, maxConnections) {
      if (!startingLeyline) { return; }
      
      const starting_leyline_already_inscribed = getLeylines()
        .find((l) => l.inscribing_leyline === startingLeyline);
      if (starting_leyline_already_inscribed) { return; }
      
      const starting_leyline_names = startingLeyline.planets.map((p) => p.name);
      const min_radius = 80;
      const too_close_min = radius * 0.8;
      let best;
      
      getLeylines().filter((l) => !l.circle).forEach((leyline) => {
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
    let startingPlanetLeyline = settings && settings.startingPlanetLeyline;
    let startingLeyline = settings && settings.startingLeyline;
    let centerCoord = settings && settings.centerCoord;
    let rotatePercent = settings && settings.rotatePercent;
    let makeNewControlPoints = settings && settings.makeNewControlPoints;
    let noDuplicatesOnLine = flags.hideDuplicatesOnLeyline;
    let theaterOnly = flags.theaterOnly;
    
    // Create the leyline
    let radius = calculateRadius(leyline);
    let circle = circle_group.circle(xOrigin, yOrigin + radius, radius);
    leyline.circle = circle;
    
    if (startingPlanet) {
      let starting_point = getPointFromPlanet(startingPlanet, startingPlanetLeyline);
      if (starting_point) {
        circle.cx = starting_point.x;
        circle.cy = starting_point.y;
  
        repositionCircle(circle, startingLeyline ? startingLeyline.circle : getCenterOfMass());
      }
    }
    
    if (centerCoord) {
      circle.cx = centerCoord.cx ?? centerCoord.x;
      circle.cy = centerCoord.cy ?? centerCoord.y;
    }
    
    circle.fill = "transparent";
    if (leyline.color) { circle.style.stroke = leyline.color; }
    
    let total = leyline.planets.length;
    
    let points_to_add = getPointsToAdd();
    points_to_add.forEach(addPlanet);
    
    addNeighborMetadata();
    addSamePlanetArcs();
    if (flags.showPowers) {
      addRegionArcs();
    }
    else {
      addArcsWithDistances();
    }
    points_to_add.forEach(addNotes);
      
    circle.style.stroke = "transparent";
    
    function addPlanet (planetData, point_index) {
      // Set up allPoints, if it wasn't already
      if (!planets[planetData.name].allPoints) {
        planets[planetData.name].allPoints = {};
      }
      if (!planets[planetData.name].allPoints[leyline.aeldman_name]) {
        planets[planetData.name].allPoints[leyline.aeldman_name] = [];
      }
      
      // Skip the starting planet, if it was provided and the point already exists
      if (startingPlanet
        && startingPlanetLeyline
        && planets[startingPlanet.name].point
        && startingPlanet.name === planetData.name) {
          const existing_point = planets[startingPlanet.name]
            .allPoints[startingPlanetLeyline.aeldman_name][0];
          planets[startingPlanet.name]
            .allPoints[leyline.aeldman_name]
            .push(existing_point);
          planetData.point = existing_point;
          startingPlanetLeyline = null;
          return;
      }
      
      let planet_point = createControlPointOnCircle(
        circle,
        point_index,
        points_to_add.length,
        {
          startingPoint: startingPlanet && planets[startingPlanet.name].allPoints[leyline.aeldman_name][0],
          rotatePercent: rotatePercent,
          capital: planets[planetData.name].capital,
          type: planets[planetData.name].type
        });
      if (planets[planetData.name].capital) {
        $(planet_point.root).addClass("capital-planet");
      }
      if (planets[planetData.name].type) {
        $(planet_point.root).addClass(planets[planetData.name].type);
      }
      circle.addDependency(planet_point);
      
      // Add the planet_point's name above it
      let planet_name = planets[planetData.name].full_name;
      let planet_text = text_group.text(planet_point.x, planet_point.y - 10, planet_name);
      planet_text.x = planet_text.x - (planet_text.getBoundingBox().width / 2);
      planet_text.style.stroke = "white";
      planet_text.style["stroke-width"] = 5;
      $(planet_text.root).addClass(planetData.name);
      $(planet_text.root).addClass(leyline.aeldman_name);
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
        if (hold_highlight.has(planetData.name)){
          hold_highlight.delete(planetData.name);
        }
        else {
          hold_highlight.add(planetData.name);
        }
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
        if (hold_highlight.has(planetData.name)) { return; }
        $(`g.${ planetData.name }`).removeClass("path-highlight");
        $(`text.${ planetData.name }`).removeClass("font-highlight");
        $(`text.neighbor-${ planetData.name }`).removeClass("font-neighbor-highlight");
        clickdown = false;
      });
      
      // Now add the new point to "point"
      planetData.point = planet_point;
      planets[planetData.name].point = planet_point;
      planets[planetData.name].allPoints[leyline.aeldman_name].push(planet_point);
      ++point_index;
    }
    
    function addNeighborMetadata () {
      leyline.planets.forEach((planet, i) => {      
        const previous_planet_name = leyline.planets[((i > 0 ? i : total) - 1) % total].name;
        const next_planet_name = leyline.planets[(i + 1) % total].name;
        
        const planet_text = $(`.${ leyline.aeldman_name}.${planet.name}`);
        planet_text.addClass(`neighbor-${ previous_planet_name }`);
        planet_text.addClass(`neighbor-${ next_planet_name }`);
      });
    }
    
    function addArcsWithDistances () {
      let planet_occurrences = {};
      let previous_planet_point;
      
      points_to_add.forEach((planetData, i) => {
        if (planet_occurrences[planetData.name] === undefined) { 
          planet_occurrences[planetData.name] = 0;
        }
        const occurrence = planet_occurrences[planetData.name];
        
        let allPoints_on_line = planets[planetData.name].allPoints[leyline.aeldman_name];
        let planet_point = allPoints_on_line[occurrence];
        
        let previous_planet = points_to_add[i === 0 ? points_to_add.length - 1 : i - 1];
        if (previous_planet_point === undefined) {
          let previous_planet_allPoints = (planets[previous_planet.name].allPoints ?? {})[leyline.aeldman_name] ?? [];
          previous_planet_point = previous_planet_allPoints[previous_planet_allPoints.length - 1];
        }
        
        let arc = createArc(circle, planet_point, previous_planet_point);
        let arc_node = $(arc.root);
        arc_node.addClass(planetData.name);
        arc_node.addClass(previous_planet.name);
        
        let distance_tooltip;
        switch (previous_planet.distance) {
          case 0:
            distance_tooltip = "Distance: < 4000 etheric miles";
            break;
          case '?':
            distance_tooltip = "Distance unknown";
            arc_node.find(".foreground-path").css("stroke", `url(#gradient-${leyline.aeldman_name})`);
            break;
          default:
          distance_tooltip = `Distance: ~${((
            theaterOnly
            ? previous_planet.theater_dist
            : previous_planet.distance)
            * 10000).toLocaleString('en-US')} etheric miles`;
        }
        arc_node.attr("title", distance_tooltip);
        circle.addDependency(arc);
        
        previous_planet_point = planet_point;
        ++planet_occurrences[planetData.name];
      });
    }
    
    function addRegionArcs () {
      let planets_to_add = getPointsToAdd({
        noReorder: true,
        getFilled: true
      });
      
      // Explode the region data into the full length of the leyline
      // This is useful for getting the exact portion for this arc.
      // We will account for '?'-length regions later
      let region_data = leyline.controllers.reduce((arr, region) => {
        if (region.length === '?') {
          arr.push(region);
        }
        else {
          for (let i = 0; i < region.length; ++i) {
            arr.push(region);
          }
        }
        return arr;
      }, []);
        
      // Adjust for theater-only
      // The issue is that the first planet on the line might not be a theater,
      // so it will start at the wrong point
      if (theaterOnly) {
        for (let i = 0; i < leyline.planets.length && !planets[leyline.planets[i].name].theater; ++i) {
          let elements_to_shift = region_data.splice(0, leyline.planets[i].distance);
          region_data = region_data.concat(elements_to_shift);
        }
      }
      
      planets_to_add.forEach((planet, i) => {
        let next_index = theaterOnly ? planet.theater_dist : planet.distance;
        if (next_index === '?') {
          next_index = region_data.findIndex((d) => d.length === '?') + 1;
        }
        const region_segment_expanded = next_index === 0
          ? [region_data[0]]
          : region_data.slice(0, next_index);
        if (region_segment_expanded.length === 0) {
          return alert("Leyline region data invalid.");
        }
        
        region_data = region_data.slice(planet.distance);
        
        // Now we will collapse it back, with the correct lengths
        const region_segment_data = region_segment_expanded
          .reduce((obj, region) => {
            let block_index = 0;
            let identifier = `${ region.name }|${ block_index }`;
            if (obj.prev !== identifier) {
              while (Object.keys(obj).includes(identifier)) {
                ++block_index;
                identifier = `${region.controller}|${block_index}`;
              }
              obj[identifier] = { region: region, count: 0 };
            }
            ++obj[identifier].count;
            obj.prev = identifier;
            return obj;
          }, {});
        delete region_segment_data.prev;
        
        // This segment will now have the correct lengths (except '?')
        let region_segment = Object.keys(region_segment_data)
          .map((identifier) => region_segment_data[identifier])
          .map((data) => {
            // Might need to shallow copy?
            if (data.region.length === '?') {
              data.region.lenFromHere = '?';
            }
            else {
              data.region.lenFromHere = data.count;
            }
            return data.region;
          });
        
        // Make '?'-length regions the average length
        const no_unknown = region_segment.filter((s) => s.length !== '?');
        const avg_len = no_unknown
          .reduce((sum, region) => { return sum + region.length; }, 0)
          / no_unknown.length;
        
        let j;
        do {
          j = region_segment.findIndex((s) => s.lenFromHere === '?');
          if (j >= 0) {
            region_segment[j].lenFromHere = avg_len;
          }
        } while (j >= 0);
        
        // Now we can actually create the arcs
        const next_planet = planets_to_add[i >= (planets_to_add.length - 1) ? 0 : i + 1];
        const total_len = region_segment.reduce((sum, region) => { return sum + region.lenFromHere; }, 0);
        
        const temp_arc = createArc(leyline.circle, next_planet.point, planet.point, { noPair: true });
        const arc_len = temp_arc.getTotalLength();
        const arc_units = arc_len / total_len;
        
        let prev_point = planet.point;
        let dist_so_far = 0;
        region_segment.forEach((region, i) => {
          dist_so_far += region.lenFromHere * arc_units;
          
          const next_point = dist_so_far >= arc_len
            ? next_planet.point
            : temp_arc.getPointAtLength(arc_len - dist_so_far);
          
          let color = "magenta";
          if (powers[region.name] && powers[region.name].color) {
            color = powers[region.name].color;
          }
          
          const class_name = `region_${region.name.replace(/[^A-Za-z]/g, '_')}`;
          let region_arc = createArc(
            leyline.circle,
            next_point,
            prev_point,
            { 
              color: color,
              tooltip: region.name,
              foregroundClass: class_name
            });
            
          // Handle Click
          let clickdown = false;
          let node = $(region_arc.root);
          node.mousedown(() => {
            clickdown = true;
          });
          node.mouseup(() => {
            if (!clickdown) { return; }
            clickdown = false;
            if (hold_highlight.has(class_name)) {
              hold_highlight.delete(class_name);
            }
            else {
              hold_highlight.add(class_name);
            }
          });
            
          // Handle Hover
          node.mouseenter(() => {
            $(`.${class_name}`).addClass("path-highlight");
          });
          node.mouseleave(() => {
            clickdown = false;
            if (!hold_highlight.has(class_name)) {
              $(`.${class_name}`).removeClass("path-highlight");
            }
          });
          
          prev_point = next_point;
        });
        
        temp_arc.remove();
      });
      leyline.circle.style.stroke = "transparent";
    }
    
    function addSamePlanetArcs () {
      leyline.planets.forEach((planet) => {
        let allPoints = planets[planet.name].allPoints;
        if (!allPoints) { return; }
        let allPoints_on_line = allPoints[leyline.aeldman_name];
        if (!allPoints_on_line || allPoints_on_line.length < 1) { return; }
        
        let points_on_other_lines = getLeylines()
          .filter((l) => l.aeldman_name !== leyline.aeldman_name)
          .reduce((points, l) => {
            if (allPoints[l.aeldman_name] && allPoints[l.aeldman_name].length > 0) {
              points.push(allPoints[l.aeldman_name][0]);
            }
            return points;
          }, []);
        
        
        points_on_other_lines.forEach((next_point, i) => {
          helper(allPoints_on_line[0], next_point);
        });
        
        allPoints_on_line.forEach((point, i) => {
          for (let j = i; j < allPoints_on_line.length; ++j) {
            let next_point = allPoints_on_line[j];
            
            helper(point, next_point);
          }
        });
        
        function helper(pointA, pointB) {
          let arc = createArc(circle, pointA, pointB, { radius: Math.pow(circle.r, 1.3) });
          $(arc.root).addClass("same-planet-path");
          $(arc.root).addClass(planet.name);
        }
      });
    }
    
    function addNotes (planet, i) {
      if (!planet || !planet.notes) { return; }
      
      const notes = planet.notes;
      const point = planets[planet.name].allPoints[leyline.aeldman_name][0];
      const radius = calculateRadius(1 + notes.length);
      const leyline_is_inscribed = leyline.inscribing_leyline !== undefined;
      
      const center_point = leyline.circle;
      
      let temp_circle = interactive.circle(point.x, point.y, radius);
      repositionCircle(temp_circle, center_point, radius);
      
      if (leyline_is_inscribed) {
        temp_circle.translate(
          -2 * (temp_circle.cx - point.x),
          -2 * (temp_circle.cy - point.y));
      }
      
      if (notes.length === 1) {
        let line = notes_group.line(point.x, point.y, temp_circle.cx, temp_circle.cy);
        $(line.root).addClass("note-path");
        
        let text = noteHelper(temp_circle, notes[0]);
        const text_bb = text.getBoundingBox();
        const line_bb = line.getBoundingBox();
        
        const intersectLeftX   = Math.max( text_bb.x, line_bb.x );
        const intersectRightX  = Math.min( text_bb.x + text_bb.width, line_bb.x + line_bb.width );
        const intersectTopY    = Math.max( text_bb.y, line_bb.y );
        const intersectBottomY = Math.min( text_bb.y + text_bb.height, line_bb.y + line_bb.height );
        
        const boxes_intersect = intersectLeftX < intersectRightX && intersectTopY < intersectBottomY;
        
        if (boxes_intersect) {
          const intersect_area = (intersectRightX - intersectLeftX) * (intersectBottomY - intersectTopY);
          const line_area = line_bb.width * line_bb.height;
          const max_ratio = 0.8;
          
          if (intersect_area > line_area * max_ratio) {
            text.x += text_bb.width / 2;
            text.y += text_bb.width / 2 * (text.x < point.x ? 1 : -1);
            $(text.root).attr("transform", `rotate(${ text.x < point.x ? '-' : '' }90,${ text.x },${ text.y })`);
          }
        }
      } else if (notes.length === 2) {
        let temp_point = createControlPointOnCircle(
          temp_circle,
          /* index= */ 1,
          /* totalPoints= */ 4,
          {
            startingPoint: point
          });
        let arc1 = createArc(temp_circle, temp_point, point, {
            forNote: true
          });
        $(arc1.root).addClass("note-path");
        noteHelper(temp_point, notes[0]);
        temp_point.remove();
        
        temp_point = createControlPointOnCircle(
          temp_circle,
          /* index= */ 3,
          /* totalPoints= */ 4,
          {
            startingPoint: point
          });
        let arc2 = createArc(temp_circle, point, temp_point, {
            forNote: true
          });
        $(arc2.root).addClass("note-path");
        noteHelper(temp_point, notes[1]);
        temp_point.remove();
      }
      
      temp_circle.remove();
      
      function noteHelper (point, message) {
        const xy = {
          x: point.cx ?? point.x,
          y: point.cy ?? point.y
        };
        
        let text = text_group.text(xy.x, xy.y, message);
        let node = $(text.root);
        node.addClass("note");
        node.addClass(planet.name);
        
        // Keep at back by default
        let group = node.parent();
        node.detach();
        group.prepend(node);
        
        text.x = text.x - (text.getBoundingBox().width / 2);
        
        node.mouseenter(() => {
          node.detach();
          group.append(node);
        });
        
        return text;
      }
    }
    
    function getPointsToAdd (settings) {
      let noReorder = settings && settings.noReorder;
      let getFilled = settings && settings.getFilled;
      let points =  leyline.planets;
      
      if (theaterOnly) {
        let prev_theater = points.reverse().find((p) => planets[p.name].theater);
        points.reverse();
        
        points.forEach((point) => {
          if (planets[point.name].theater) {
            prev_theater = point;
            point.theater_dist = point.distance;
          }
          else if (prev_theater.distance !== '?') {
            if (point.distance === '?') {
              prev_theater.theater_dist === '?';
            }
            else {
              prev_theater.theater_dist += point.distance;
            }
          }
        });
        
        points = points.filter((p) => planets[p.name].theater);
      }
      
      if (noDuplicatesOnLine) {
        let uniques = new Set();
        
        points = points.filter((point) => {
          let unique = !uniques.has(point.name);
          
          uniques.add(point.name);
          
          return unique;
        });
      }
      if (!getFilled && !makeNewControlPoints) {
        points = points.filter((point) => {
          return point.point === undefined;
        });
      }
      // And in which order
      if (startingPlanet && !noReorder) {
        const starting_planet_index = points
          .findIndex((p) => p.name === startingPlanet.name);
        if (starting_planet_index > 0) {
          points = points.slice(starting_planet_index)
            .concat(points.slice(0, starting_planet_index));
        }
      }
      
      return points;
    }
  }
  
  function createControlPointOnCircle (circle, index, total_points, settings) {
    let startingPoint = settings && settings.startingPoint;
    let rotatePercent = (settings && settings.rotatePercent) || 0;
    let capital = settings && settings.capital;
    let type = settings && settings.type;
    
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
    
    // Handle alternate symbols
    const ns = $("#map > svg").attr("xmlns");
    if (capital) {
      let group = $(planet_control_point.root);
      let star = $(document.createElementNS(ns, "polygon"));
      star.attr("points", "0,-6 -4,6 6,-2 -6,-2 4,6");
      star.attr("id", `${ group.attr("id") }-star`);
      
      group.append(star);
    }
    else if (type) {
      switch (type) {
        case "object":
          let group = $(planet_control_point.root);
          let square = $(document.createElementNS(ns, "rect"));
          square.attr("x", "-3.5");
          square.attr("y", "-3.5");
          square.attr("width", "7");
          square.attr("height", "7");
          square.attr("transform", "rotate(45)");
          square.attr("id", `${ group.attr("id") }-square`);
          
          group.append(square);
          break;
      }
    }
    
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
    
    getLeylines().forEach((leyline) => {
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
      
      // And can't be from an inscribed leyline
      if (noInscribed && leyline.inscribing_leyline) {
        return;
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
    
    getLeylines().forEach((leyline) => {
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
    let point = {
      x: guidingPoint.cx ?? guidingPoint.x,
      y: guidingPoint.cy ?? guidingPoint.y
    };
    
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
  
  function getPointFromPlanet (planet, leyline) {
    if (!planet) { return; }
    if (leyline) {
      return ((planets[planet.name].allPoints || {})[leyline.aeldman_name] || [])[0];
    }
    
    if (planet.point) {
      return planet.point;
    }
    
    if (planet.name) {
      if (!planets[planet.name]) { alert(`Missing data for planet: ${planet.name}`); }
      
      return planets[planet.name].point;
    }
  }
  
  function getCenterOfMass () {
    const all_planets = getPlanets();
    
    let num_created_planets = all_planets.reduce((total, planet) => { return total + (planets[planet.name].point ? 1 : 0); }, 0);
    if (num_created_planets === 0) { return { x: 0, y: 0 }; }
    
    let avg_x = all_planets.reduce((total, planet) => { return total + (planets[planet.name].point ? planets[planet.name].point.x : 0) }, 0) / num_created_planets;
    let avg_y = all_planets.reduce((total, planet) => { return total + (planets[planet.name].point ? planets[planet.name].point.y : 0) }, 0) / num_created_planets;
    
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
  
  function calculateRadius (leylineOrNumber) {
    const num_points = Number.isInteger(leylineOrNumber)
      ? leylineOrNumber
      : getPlanets(leylineOrNumber).length;
      
    return Math.pow(Math.max(2, num_points), .825) * 20;
  }
  
  function getDistance (pointA, pointB) {
    const a = { x: pointA.cx ?? pointA.x, y: pointA.cy ?? pointA.y };
    const b = { x: pointB.cx ?? pointB.x, y: pointB.cy ?? pointB.y };
    
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
  }
  
  function createArc (circle, pointA, pointB, settings) {
    const radius = (settings && settings.radius) || circle.r;
    const color = (settings && settings.color) || circle.style.stroke;
    const tooltip = settings && settings.tooltip;
    const foregroundClass = settings && settings.foregroundClass;
    const forNote = settings && settings.forNote; // Uses the notes group and doesn't pair
    const noPair = settings && settings.noPair;
    
    const path_value = `M ${pointA.x} ${pointA.y} A ${radius} ${radius} 0 0 0 ${pointB.x} ${pointB.y}`;
    
    let arc_pair;
    let path;
    if (forNote) {
      path = notes_group.path(path_value);
    }
    else if (noPair) {
      path = arc_group.path(path_value);
    }
    else {
      arc_pair = arc_group.group();
      let background_path = arc_pair.path(path_value);
      $(background_path.root).addClass("background-path");
      
      path = arc_pair.path(path_value);
      $(path.root).addClass("foreground-path");
      if (foregroundClass) {
        $(path.root).addClass(foregroundClass);
      }
    }
    path.style.fill = "none";
    path.style.stroke = color;
    
    let return_item = (forNote || noPair) ? path : arc_pair;
    
    if (tooltip) {
      $(return_item.root).attr("title", tooltip);
    }
    
    return return_item;
  }
}

let recenterOnPlanet;
let resetLeylineCheckboxes;
let clearLegend;
let maybeShowLegend;
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
  
  let grid_group = interactive.group();
  notes_group = interactive.group();
  circle_group = interactive.group();
  arc_group = interactive.group();
  text_group = interactive.group();
  
  setupGradient();
  generateAxisLines();
  handlePanning(interactive, { scaleByZoomSlider: true });
  let zoom_slider = generateZoomSlider();
  generateLeylineCheckboxes();
  generateRegionCheckboxes();
  generatePlanetSelector();
  generateAdditionalControls();
  generatePowersLegend();
  
  function generateLeylineCheckboxes () {
    let lines = getLeylines(/* includeDisabled= */ true);
    
    const total_leylines = lines.length;
    const box_padding = 30;
    const padding_between = 20;
    const controls_height = 18;
    const widest_text = Object.keys(leylines).map((i) => leylines[i]).reduce((max, l) => { return Math.max(max, l.aeldman_name.length); }, 0);
    const max_height = height * 0.55;
    const control_box_height = box_padding * 2 + ((total_leylines - 1) * (padding_between + controls_height));
    const controls_width = widest_text * 10 + 2 * box_padding;
    
    let checkboxes = new Interactive("leyline-checkboxes", {
      width: controls_width,
      height: Math.min(max_height, control_box_height),
      originX: 0,
      originY: 0,
      border: true
    });
    checkboxes.border = true;
    let background = checkboxes.rectangle(0, 0, controls_width, control_box_height);
    background.fill = "white";
    
    lines.forEach((leyline, i) => {
      let checkbox = checkboxes.checkBox(
        box_padding,
        box_padding + i * (padding_between + controls_height),
        leyline.aeldman_name,
        /* enabled= */ !leyline.disabled);
        
      if (!leyline.disabled) {
        checkbox.box.fill = leyline.color;
      }
      checkbox.box.style.stroke = leyline.darker_color;
        
      checkbox.onchange = () => {
        clearAll();
        if (checkbox.value) {
          checkbox.box.fill = leyline.color;
        }
        
        leyline.disabled = !checkbox.value;
        
        reset();
      }
      
      $(checkbox.label.root).click(() => { checkbox.toggle(); });
    });
    
    if (control_box_height > max_height) {
      handlePanning(checkboxes, {
        boundingBox: background.getBoundingBox(),
      });
    }
    
    resetLeylineCheckboxes = function () {
      checkboxes.remove();
      generateLeylineCheckboxes();
    };
  }
  
  function generateRegionCheckboxes () {
    const box_padding = 30;
    const padding_between = 20;
    const controls_height = 18;
    
    let regions = [
      { json_name: "imperial", label: "Imperial Space" },
      { json_name: "celestial", label: "Celestial Space" },
      { json_name: "naga", label: "Naga Space" }
    ];
    
    let regionInteractive = new Interactive("region-checkboxes", {
      width: 190,
      height: box_padding * 2 + ((regions.length - 1) * (padding_between + controls_height)),
      originX: 0,
      originY: 0
    });
    regionInteractive.border = true;
    let background = regionInteractive.rectangle(0, 0, regionInteractive.width, regionInteractive.height);
    background.fill = "white";
    
    regions.forEach((region, i) => {
      const selected = Object.keys(leylines)
        .map((i) => leylines[i])
        .some((l) => l.region === region.json_name && !l.skip);
        
      let checkbox = regionInteractive.checkBox(
        box_padding,
        box_padding + (padding_between + controls_height) * i,
        region.label,
        selected);
      region.checkbox = checkbox;
        
      checkbox.onchange = () => {
        clearAll();
        
        Object.keys(leylines).map((i) => leylines[i]).forEach((leyline) => {
          if (leyline.region === region.json_name) {
            leyline.skip = !checkbox.value;
          }
        });
        
        reset();
        resetLeylineCheckboxes();
      };
    });
  }
  
  function generateAdditionalControls () {
    const width = 225,
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
    
    let theaterOnly = additionalInteractive.checkBox(padding, padding + distance_between * flag_index, "Theater only (WIP)", flags.theaterOnly);
    let theaterOnlySavedData = {};
    theaterOnly.onchange = () => {
      flags.theaterOnly = theaterOnly.value;
      clearAll();
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
    
    /*
    let no_duplicates = additionalInteractive.checkBox(padding, padding + distance_between * flag_index, "Allow inner loops", flags.hideDuplicatesOnLeyline);
    no_duplicates.onchange = () => {
      flags.hideDuplicatesOnLeyline = no_duplicates.value;
      
      clearAll();
      reset();
    };
    ++flag_index;
    */
    
    let show_powers = additionalInteractive.checkBox(padding, padding + distance_between * flag_index, "Show Leyline Regions", flags.showPowers);
    show_powers.onchange = () => {
      clearAll();
      flags.showPowers = show_powers.value;
      if (show_powers.value) {
        $("#powers-legend-expand").removeClass("hidden");
      }
      else {
        $("#powers-legend").addClass("hidden");
        $("#powers-legend-expand").addClass("hidden");
      }
      reset();
    };
    
    [
      inscribable,
      theaterOnly,
      same_planet_paths,
      same_planet_paths_on_hover,
      show_powers,
      // no_duplicates,
    ]
    .forEach((checkbox) => {
      if (!checkbox) { return; }
      $(checkbox.label.root).click(() => { checkbox.toggle(); });
    });
  }
  
  function generateZoomSlider () {
    const slider_width = width / 4;
    const slider_default_value = 1;
    const padding_between = 20;
    const padding_around = 10;
    const max_zoom = 2;
    const min_zoom = .25;
    
    const sliderInteractive = new Interactive("zoom-slider", {
      width: slider_width,
      height: 30,
      originX: 0,
      originY: 0
    });
    
    let slider = sliderInteractive.slider(padding_around, 20, {
      min: min_zoom,
      max: max_zoom,
      value: slider_default_value,
      width: slider_width
    });    
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
        
      // Also change the interactive size of the slider to fit the text properly
      sliderInteractive.width =
        padding_around * 2
        + slider.width
        + padding_between
        + slider_text.getBoundingBox().width;
      
      slider.updateDependents();
    };
    
    let slider_text = sliderInteractive.text(slider_width + padding_between, 25);
    slider_text.update = () => { slider_text.contents = `${ Math.floor(slider.value * 100) }%`; };
    slider_text.update();
    
    slider_text.addDependency(slider);
    
    slider.onchange();
    
    return slider;
  }
  
  function generatePlanetSelector () {
    let selector = $("#planet-selector");
    
    Object.keys(planets).map((i) => planets[i])
      .sort((a, b) => {
        return a.full_name > b.full_name ? 1 : b.full_name > a.full_name ? -1 : 0;
      })
      .forEach(planet => {
        selector.append(`<option value="${ planet.name }">${ planet.full_name }</option>`);
      });
    selector.val(startingPlanet.name);
    
    selector.change((event) => {
      recenterOnPlanet(planets[selector.val()]);
    });
  }
  
  function generateAxisLines () {
    let x = grid_group.line(-width, yOrigin, width * 3, yOrigin);
    let y = grid_group.line(xOrigin, -height, xOrigin, height * 3);
    x.style.stroke = "lightgrey";
    y.style.stroke = "lightgrey";
  }
  
  function generatePowersLegend () {
    let expander = $("#powers-legend-expand");
    let legend = $("#powers-legend");
    
    generateExpander();
    
    // Make hidden on page load
    expander.addClass("hidden");
    legend.addClass("hidden");
    
    function generateExpander () {
      const expanderInteractive = new Interactive("powers-legend-expand", {
        width: expander.width(),
        height: expander.height(),
        originX: 0,
        originY: 0
      });
      
      let expand_checkbox = expanderInteractive.checkBox(0, 0, "Show Regions Legend", false);
      const expand_checkbox_width = expand_checkbox.getBoundingBox().width;
      const expand_checkbox_height = expand_checkbox.getBoundingBox().height;
      expander.width(expand_checkbox_width);
      expander.height(expand_checkbox_height);
      expanderInteractive.width = expand_checkbox_width;
      expanderInteractive.height = expand_checkbox_height;
      expand_checkbox.box.y += Math.ceil(expand_checkbox_height / 2);
      expand_checkbox.label.y += Math.ceil(expand_checkbox_height / 2);
      expand_checkbox.box.x += Math.ceil(expand_checkbox.box.width / 2);
      expand_checkbox.label.x += Math.ceil(expand_checkbox.box.width / 2);
    
      expand_checkbox.onchange = () => {
        if (expand_checkbox.value) {
          expand_checkbox.value = false;
        }
        else {
          expander.addClass("hidden");
          legend.removeClass("hidden");
          flags.showLegend = true;
          generateLegend();
        }
      };
    }
    
    function generateLegend () {
      const outer_padding = 30;
      const inner_column_padding = 20;
      const nested_indent_amount = 20;
      const legendInteractive = new Interactive("powers-legend", {
        width: legend.width(),
        height: legend.height(),
        originX: 0,
        originY: 0
      });
      legendInteractive.border = true;
      
      let temp_text = legendInteractive.text(0, 0, "Text");
      const checkbox_height = temp_text.getBoundingBox().height;
      const inner_checkbox_padding = checkbox_height / 3;
      temp_text.remove();
      
      const powers_arr = getVisiblePowers();
      const top_level_powers = powers_arr.filter((p) => !p.parent);
      
      // These should all already be in alphabetical order
      const top_level_major = top_level_powers.filter((p) => !p.secondary && !p.minor);
      const top_level_secondary = top_level_powers.filter((p) => p.secondary);
      const top_level_minor = top_level_powers.filter((p) => p.minor);
      
      const major_blocks = top_level_major.map((power) => generatePowerGroup(power));
      const secondary_blocks = top_level_secondary.map((power) => generatePowerGroup(power));
      const minor_blocks = top_level_minor.map((power) => generatePowerGroup(power));
      const all_blocks = major_blocks.concat(secondary_blocks).concat(minor_blocks);
      
      distributeBlocks();
      generateCollapseButton();
      
      let bounds = legendInteractive.getBoundingBox();
      bounds.height += outer_padding;
      bounds.width += outer_padding;
      
      if (bounds.height > legend.height() || bounds.width > legend.width()) {
        handlePanning(legendInteractive, { boundingBox: bounds })
      }
      
      function getVisiblePowers () {
        const visible_powers = Object.keys(powers).map((i) => powers[i]);
        
        const lines = getLeylines();
        const controllers = [].concat(...lines.map((l) => l.controllers));
        const names = new Set(controllers.map((c) => c.name));
        
        return visible_powers.filter((p) => names.has(p.name));
      }
      
      function generatePowerGroup (topLevelPower, g) {
        let group = (g ?? legendInteractive).group();
        
        const top_level_checkbox = generatePowerCheckbox(topLevelPower, 0);
        
        let children;
        do {
          const children = powers_arr.filter((p) => p.parent === topLevelPower.name);
          
          const child_blocks = children.map((child) => generatePowerGroup(child, group));
          child_blocks.forEach((block, i) => block
            .setAttribute("transform", `translate(${ nested_indent_amount }, ${ (i + 1) * checkbox_height })`));
        } while (children && children.length > 0);
        
        return group;
        
        function generatePowerCheckbox (power, level) {
          let checkbox = legendInteractive.checkBox(outer_padding, outer_padding, power.name, true);
          
          checkbox.box.fill = power.color;
          checkbox.box.stroke = power.darker_color;
          
          let elem = $(checkbox.root);
          
          // Handle highlighting
          let highlight = false;
          let paths = $(`path.region_${ power.name.replace(/[^A-Za-z0-9]/g, '_') }`);
          let label = $(checkbox.label.root);
          elem.mouseenter(() => {
            paths.addClass("path-highlight");
            label.addClass("font-highlight");
          });
          elem.mouseleave(() => {
            if (!highlight) {
              paths.removeClass("path-highlight");
              label.removeClass("font-highlight");
            }
          });
          
          // Handle clicking
          checkbox.onchange = () => {
            checkbox.box.fill = power.color;
          }
          elem.click(() => {
            highlight = !highlight;
          });
          
          group.appendChild(checkbox);
          
          return checkbox;
        }
      }
      
      function distributeBlocks () {
        const cols = calcNumCols(); // An array of the widths of each column
        const blocks_per_col = Math.ceil(all_blocks.length / cols.length);
        let y_offset = 0;
        all_blocks.forEach((block, i) => {
          const column_index = Math.floor(i / blocks_per_col);
          block.setAttribute(
            "transform",
            `translate(${
              ((column_index === 0) ? 0 : cols[column_index - 1])
              + column_index * inner_column_padding
            }, ${ y_offset })`);
          y_offset += block.getBoundingBox().height + inner_checkbox_padding;
          if ((i + 1) % blocks_per_col === 0) {
            y_offset = 0;
          }
        });
      
        legendInteractive.width =
          2 * outer_padding
          + cols.reduce((total, x) => { return total + x; }, 0)
          + (cols.length - 1) * inner_column_padding;
        legend.width(legendInteractive.width);
        
        if (legendInteractive.getBoundingBox().height < legend.height()) {
          legend.height(legendInteractive.getBoundingBox().height + outer_padding);
          legendInteractive.height = legendInteractive.getBoundingBox().height + outer_padding;
        }
        
        function calcNumCols () {
          if (powers_arr.length * checkbox_height < legend.height()) {
            return [Math.max(...all_blocks.map((block) => block.getBoundingBox().width))];
          }
          
          let best_fit = [];
          let max_width = legend.width();
          
          let min_width = Math.min(...all_blocks.map((block) => block.getBoundingBox().width));
          
          for (let i = 1; (min_width * i + (i - 1) * inner_column_padding + 2 * outer_padding) <= max_width; ++i) {
            let column_widths = [];
            for (let j = 0; j < i; ++j) {
              const blocks_per_col = all_blocks.length / i;
              const this_col = all_blocks.slice(j * blocks_per_col, (j + 1) * blocks_per_col);
              const max_width = Math.max(...this_col.map((block) => block.getBoundingBox().width));
              column_widths.push(max_width);
            }
            
            const total_width =
              2 * outer_padding
              + column_widths.reduce((total, x) => { return total + x; }, 0)
              + (i - 1) * inner_column_padding;
            
            if (total_width <= max_width) {
              best_fit = column_widths;
            }
          }
          
          return best_fit;
        }
      }
      
      function generateCollapseButton () {
        const padding = 5;
        
        let label = legendInteractive.text(0, 0, '⌄');
        label.x += label.getBoundingBox().width / 2 + padding;
        label.y += label.getBoundingBox().height / 2 + padding;
        let elem = $(label.root);
        
        elem.attr("id", "powers-legend-collapse");
        
        elem.click(() => {
          flags.showLegend = false;
          clearLegend();
        });
      }
      
      clearLegend = function () {
        expander.removeClass("hidden");
        legendInteractive.remove();
        legend.css("width", "");
        legend.css("height", "");
        legend.addClass("hidden");
      }
      
      maybeShowLegend = function () {
        if (flags.showLegend) {
          if (clearLegend) {
            clearLegend();
          }
          
          expander.addClass("hidden");
          legend.removeClass("hidden");
          
          setTimeout(generateLegend, 1);
        }
      }
    }
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
    
    // For some reason, this setTimeout stops the app from breaking on the second planet recenter
    setTimeout(() => {
      startingPlanet = planet;
      reset();
    }, 1);
  }
  
  function clearAll () {
    const leylines_before = leylines;
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
    Object.keys(leylines).map((i) => leylines[i]).forEach((l) => {
      l.planets.forEach((p) => {
        if (p.point) { p.point.remove(); }
        delete p.point;
      });
      l.circle && l.circle.remove();
      delete l.circle;
      delete l.inscribing_leyline;
    });
    
    if (clearLegend) {
      clearLegend();
      clearLegend = undefined;
    }
    
    notes_group.clear();
    arc_group.clear();
    circle_group.clear();
    text_group.clear();
  }
  
  function reset () {
    const focus_planet = startingPlanet.name;
    let focus_planet_exists_in_selection = getLeylines()
      .some((l) => l.planets.map((p) => p.name).includes(focus_planet));
      
    if (!focus_planet_exists_in_selection) {
      const visible_planets = getLeylines().reduce((arr, line) =>{
        return arr.concat(getPlanets(line).map((p) => p.name));
      }, []);
      
      const occurrences = visible_planets.reduce((occ, name) => {
        if (occ[name] === undefined) { occ[name] = 0; }
        
        ++occ[name];
        
        return occ;
      }, {});
      
      const planet_with_most_occurrences = Object.keys(occurrences)
        .reduce((most, name) => {
          if (most === null || most.occurrence < occurrences[name]) {
            return { name: name, occurrence: occurrences[name] };
          }
          return most;
        }, null);
      console.log(planet_with_most_occurrences);
      
      if (planet_with_most_occurrences) {
        $("#planet-selector").val(planet_with_most_occurrences.name);
        $("#planet-selector").change();
        return;
      }
    }
        
    getLeylines(/* includeDisabled= */ true).forEach((leyline) => {
      const visible_planets = getPlanets(leyline);
      if (visible_planets.length === 0) {
        leyline.skip = true;
      }
    });
    
    main(startingPlanet);
    
    if (maybeShowLegend) {
      maybeShowLegend();
    }
  }
  
  function handlePanning (interactive, settings) {
    let boundingBox = settings && settings.boundingBox;
    let scaleByZoomSlider = settings && settings.scaleByZoomSlider;
    let panning;
    
    $("body").bind("mousewheel", scrollHandler);
    $(interactive.root).bind("mousedown", startPan);
    $("body").bind("mouseup", stopPan);
    $("body").bind("mouseleave", stopPan);
    $("body").bind("mousemove", pan);
    $(interactive.root).bind("touchstart", startPan);
    $("body").bind("touchend", stopPan);
    $("body").bind("touchmove", pan);
    
    function startPan (event) {
      panning = { 
        x: event.clientX
          ?? event.originalEvent.touches[0].pageX
          ?? event.originalEvent.changedTouches[0].pageX,
        y: event.clientY
          ?? event.originalEvent.touches[0].pageY
          ?? event.originalEvent.changedTouches[0].pageY
      };
      
      document.body.style.cursor = "all-scroll";
    }
    
    function stopPan (event) {
      panning = false;
      
      document.body.style.cursor = "inherit";
    }
    
    function pan (event) {
      if (!panning) { return; }
      
      let x = event.clientX
        ?? event.originalEvent.touches[0].pageX
        ?? event.originalEvent.changedTouches[0].pageX;
      let y = event.clientY
        ?? event.originalEvent.touches[0].pageY
        ?? event.originalEvent.changedTouches[0].pageY;
      
      let delta_x = (panning.x - x) / (scaleByZoomSlider ? zoom_slider.value : 1);
      let delta_y = (panning.y - y) / (scaleByZoomSlider ? zoom_slider.value : 1);
      
      let viewbox_parts = interactive.viewBox.split(' ');
      const viewbox_x = parseInt(viewbox_parts[0]);
      const viewbox_y = parseInt(viewbox_parts[1]);
      const viewbox_width = parseInt(viewbox_parts[2]);
      const viewbox_height = parseInt(viewbox_parts[3]);
      
      if (boundingBox) {
        if (viewbox_x + delta_x < boundingBox.x
          || viewbox_x + viewbox_width + delta_x > boundingBox.x + boundingBox.width){
          delta_x = 0;
        }
        if (viewbox_y + delta_y < boundingBox.y
          || viewbox_y + viewbox_height + delta_y > boundingBox.y + boundingBox.height) {
          delta_y = 0;
        }
      }
      
      interactive.setViewBox(
        Math.min(width, Math.max(-width, viewbox_x + delta_x)),
        Math.min(height, Math.max(-height, viewbox_y + delta_y)),
        viewbox_width,
        viewbox_height);
      
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

  
function getLeylines (includeDisabled) {
  return Object.keys(leylines)
    .map((i) => leylines[i])
    .filter((l) => !l.skip)
    .filter((l) => !l.disabled || includeDisabled);
}

function getPlanets (leyline) {
  if (leyline) {
    return leyline.planets.filter((p) => !flags.theaterOnly || planets[p.name].theater);
  }
  
  return Object.keys(planets)
    .map((i) => planets[i])
    .filter((p) => !flags.theaterOnly || p.theater);
}
  
function getAngle(reference, control) {
  let angle = Math.abs(Math.atan2(control.y - reference.y, reference.x - control.x));
  
  if ((control.y - reference.y) > 0) {
      angle = Math.PI * 2 - angle;
  }
  
  return (360 - (angle * 180 / Math.PI)).toFixed(1);
}
