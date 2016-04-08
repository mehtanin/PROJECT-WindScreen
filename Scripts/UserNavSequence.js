// Dimensions of sunburst.
var width = 900;
var widthc = 1050;
var height = 600;
var radius = Math.min(width, height) / 2;

// Breadcrumb dimensions: width, height, spacing, width of tip/tail.
var b = { w: 220, h: 50, s: 3, t: 50 };

// make `colors` an ordinal scale
var colors = d3.scale.category20c();

// Total size of all segments; we set this later, after loading the data.
var totalSize = 0;

var vis = d3.select("#chart").append("svg:svg")
    .attr("width", width)
    .attr("height", height)
    .append("svg:g")
    .attr("id", "container")
    .attr("transform", "translate(" + width / 2 + "," + height / 2 + ")");

var partition = d3.layout.partition()
    .size([2 * Math.PI, radius * radius])
    .value(function (d) { return d.size; });

var arc = d3.svg.arc()
    .startAngle(function (d) { return d.x; })
    .endAngle(function (d) { return d.x + d.dx; })
    .innerRadius(function (d) { return Math.sqrt(d.y); })
    .outerRadius(function (d) { return Math.sqrt(d.y + d.dy); });


var json = getData();
createVisualization(json);

// Main function to draw and set up the visualization, once we have the data.
function createVisualization(json) {

    // Basic setup of page elements.
    initializeBreadcrumbTrail();

    // Bounding circle underneath the sunburst, to make it easier to detect
    // when the mouse leaves the parent g.
    vis.append("svg:circle")
        .attr("r", radius)
        .style("opacity", 0);

    // For efficiency, filter nodes to keep only those large enough to see.
    var nodes = partition.nodes(json)
        .filter(function (d) {
            return (d.dx > 0.005); // 0.005 radians = 0.29 degrees
        });

    var path = vis.data([json]).selectAll("path")
        .data(nodes)
        .enter().append("svg:path")
        .attr("display", function (d) { return d.depth ? null : "none"; })
        .attr("d", arc)
        .attr("fill-rule", "evenodd")
        .style("fill", function (d) { return d.color; })
        .style("opacity", 1)
        .on("mouseover", mouseover)
        .on("click", click).each(stash)
       .transition()
       .duration(750)
       .attrTween("d", arcTween);



    // Add the mouseleave handler to the bounding circle.
    d3.select("#container").on("mouseleave", mouseleave);

    // Get total size of the tree = value of root node from partition.
    totalSize = path.node().__data__.value;
};
function click(d) {
    d3.select("#container").selectAll("path").remove();
    var path = vis.data([d]).selectAll("path")
       .data(nodes)
       .enter().append("svg:path")
       .attr("display", function (d) { return d.depth ? null : "none"; })
       .attr("d", arc)
       .attr("fill-rule", "evenodd")
       .style("fill", function (d) { return d.color; })
       .style("opacity", 1)
       .on("mouseover", mouseover)
       .on("click", click)
       .each(stash)
           .transition()
           .duration(750)
           .attrTween("d", arcTween);
    ;

    // Get total size of the tree = value of root node from partition.
    totalSize = path.node().__data__.value;
}

function arcTween(a) {
    var i = d3.interpolate({ x: a.x0, dx: a.dx0 }, a);
    return function (t) {
        var b = i(t);
        a.x0 = b.x;
        a.dx0 = b.dx;
        return arc(b);
    };
};

function stash(d) {
    d.x0 = 0; // d.x;
    d.dx0 = 0; //d.dx;
};

// Fade all but the current sequence, and show it in the breadcrumb trail.
function mouseover(d) {

    var percentage = (100 * d.value / totalSize).toPrecision(3);
    var percentageString = percentage + "%";
    if (percentage < 0.1) {
        percentageString = "< 0.1%";
    }

    d3.select("#percentage")
        .text(percentageString);

    d3.select("#explanation")
        .style("visibility", "");

    var sequenceArray = getAncestors(d);
    updateBreadcrumbs(sequenceArray, percentageString);

    // Fade all the segments.
    d3.selectAll("path")
        .style("opacity", 0.3);

    // Then highlight only those that are an ancestor of the current segment.
    vis.selectAll("path")
        .filter(function (node) {
            return (sequenceArray.indexOf(node) >= 0);
        })
        .style("opacity", 1);
}
d3.select(self.frameElement).style("height", height + "px");

// Restore everything to full opacity when moving off the visualization.
function mouseleave(d) {

    // Hide the breadcrumb trail
    d3.select("#trail")
        .style("visibility", "hidden");

    // Deactivate all segments during transition.
    d3.selectAll("path").on("mouseover", null);

    // Transition each segment to full opacity and then reactivate it.
    d3.selectAll("path")
        .transition()
        .duration(1000)
        .style("opacity", 1)
        .each("end", function () {
            d3.select(this).on("mouseover", mouseover);
        });

    d3.select("#explanation")
        .transition()
        .duration(1000)
        .style("visibility", "hidden");
}

// Given a node in a partition layout, return an array of all of its ancestor
// nodes, highest first, but excluding the root.
function getAncestors(node) {
    var path = [];
    var current = node;
    while (current.parent) {
        path.unshift(current);
        current = current.parent;
    }
    return path;
}

function initializeBreadcrumbTrail() {
    // Add the svg area.
    var trail = d3.select("#sequence").append("svg:svg")
        .attr("width", widthc)
        .attr("height", 50)
        .attr("id", "trail");
    // Add the label at the end, for the percentage.
    trail.append("svg:text")
      .attr("id", "endlabel")
      .style("fill", "#000");
}

// Generate a string that describes the points of a breadcrumb polygon.
function breadcrumbPoints(d, i) {
    var points = [];
    points.push("0,0");
    points.push(b.w + ",0");
    points.push(b.w + b.t + "," + (b.h));
    points.push(b.w + "," + b.h);
    points.push("0," + b.h);
    if (i > 0) { // Leftmost breadcrumb; don't include 6th vertex.
        points.push(b.t + "," + (b.h));
    }
    return points.join(" ");
}

// Update the breadcrumb trail to show the current sequence and percentage.
function updateBreadcrumbs(nodeArray, percentageString) {

    // Data join; key function combines name and depth (= position in sequence).
    var g = d3.select("#trail")
        .selectAll("g")
        .data(nodeArray, function (d) { return d.name + d.depth; });

    // Add breadcrumb and label for entering nodes.
    var entering = g.enter().append("svg:g");

    entering.append("svg:polygon")
        .attr("points", breadcrumbPoints)
        .style("fill", function (d) { return d.color; });

    entering.append("svg:text")
        .attr("x", (b.w + b.t) / 2)
        .attr("y", b.h / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .text(function (d) { return d.name; });

    // Set position for entering and updating nodes.
    g.attr("transform", function (d, i) {
        return "translate(" + i * (b.w + b.s) + ", 0)";
    });

    // Remove exiting nodes.
    g.exit().remove();

    // Now move and update the percentage at the end.
    d3.select("#trail").select("#endlabel")
        .attr("x", (nodeArray.length + 0.5) * (b.w + b.s))
        .attr("y", b.h / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .text(percentageString);

    // Make the breadcrumb trail visible, if it's hidden.
    d3.select("#trail")
        .style("visibility", "");

}

function getData() {
    return {
        "name": "RAVON", "color": " #d9d9d9",
        "children": [
        {
            "name": "etc", "color": "#31a354",
            "children": [
               { "name": "NullClass.cpp", "color": "#a1d99b", "size": "64" },
               { "name": "NullClass.h", "color": "#a1d99b", "size": "89" },
               { "name": "NullGroup.cpp", "color": "#a1d99b", "size": "109" },
               { "name": "NullGroup.h", "color": "#a1d99b", "size": "153" },
               { "name": "NullModule.cpp", "color": "#a1d99b", "size": "174" },
               { "name": "NullModule.h", "color": "#a1d99b", "size": "162" },
               { "name": "NullPart.cpp", "color": "#a1d99b", "size": "97" },
               { "name": "NullStateMachine.cpp", "color": "#a1d99b", "size": "87" },
               { "name": "NullStateMachine.h", "color": "#a1d99b", "size": "95" },
               { "name": "NullTest.cpp", "color": "#a1d99b", "size": "101" },
               { "name": "NullWidget.cpp", "color": "#a1d99b", "size": "213" },
               { "name": "NullWidget.h", "color": "#a1d99b", "size": "149" }
            ]
        },
           {
               "name": "tools", "color": "#e6550d",
               "children": [
                  {
                      "name": "browser", "color": "#fd8d3c",
                      "children": [
                         { "name": "tRepModule.cpp", "color": "#fdae6b", "size": "557" },
                         { "name": "mcabrowser.cpp", "color": "#fdae6b", "size": "89" },
                         { "name": "tBrowserBlackboardCopy.h", "color": "#fdae6b", "size": "68" },
                         { "name": "tBrowserPlugin.cpp", "color": "#fdae6b", "size": "99" },
                         { "name": "tBrowserPlugin.h", "color": "#fdae6b", "size": "102" },
                         { "name": "tConnect.cpp", "color": "#fdae6b", "size": "212" },
                         { "name": "tConnect.h", "color": "#fdae6b", "size": "118" },
                         { "name": "tGlobaIlODescription.cpp", "color": "#fdae6b", "size": "54" },
                         { "name": "tGloballODescription.h", "color": "#fdae6b", "size": "63" },
                         { "name": "tLevelGraph.cpp", "color": "#fdae6b", "size": "129" },
                         { "name": "tLevelGraph.h", "color": "#fdae6b", "size": "84" },
                         { "name": "tLevelGraphEdge.cpp", "color": "#fdae6b", "size": "117" },
                         { "name": "tLevelGraphEdge.h", "color": "#fdae6b", "size": "98" },
                         { "name": "tLevelGraphLayer.cpp", "color": "#fdae6b", "size": "272" },
                         { "name": "tLevelGraphLayer.h", "color": "#fdae6b", "size": "72" },
                         { "name": "tLevelGraphNode.cpp", "color": "#fdae6b", "size": "126" },
                         { "name": "tLevelGraphNode.h", "color": "#fdae6b", "size": "137" },
                         { "name": "tLevelGraphNodeEdge.h", "color": "#fdae6b", "size": "93" },
                         { "name": "tMainWindow.cpp", "color": "#fdae6b", "size": "263" },
                         { "name": "tMainWindow.h", "color": "#fdae6b", "size": "82" },
                         { "name": "tManageBlackboards.cpp", "color": "#fdae6b", "size": "107" },
                         { "name": "tManageBlackboards.h", "color": "#fdae6b", "size": "117" },
                         { "name": "tOneIO.cpp", "color": "#fdae6b", "size": "81" },
                         { "name": "tOneIO.h", "color": "#fdae6b", "size": "78" },
                         { "name": "tQBaseModule.cpp", "color": "#fdae6b", "size": "174" },
                         { "name": "tQBaseModule.h", "color": "#fdae6b", "size": "86" },
                         { "name": "tQBlackboardInfoListBoxltem.h", "color": "#fdae6b", "size": "79" },
                         { "name": "tQBrowserWindow.cpp", "color": "#fdae6b", "size": "228" },
                         { "name": "tQBrowserWindow.h", "color": "#fdae6b", "size": "111" },
                         { "name": "tQConfigDialog.cpp", "color": "#fdae6b", "size": "317" },
                         { "name": "tQConfigDialog.h", "color": "#fdae6b", "size": "156" },
                         { "name": "tQConnectionProgress.cpp", "color": "#fdae6b", "size": "102" },
                         { "name": "tQConnectionProgress.h", "color": "#fdae6b", "size": "78" },
                         { "name": "tQDebugDomainListBoxItem.h", "color": "#fdae6b", "size": "79" },
                         { "name": "tQEdge.cpp", "color": "#fdae6b", "size": "210" },
                         { "name": "tQEdge.h", "color": "#fdae6b", "size": "78" },
                         { "name": "tQGroup.cpp", "color": "#fdae6b", "size": "163" },
                         { "name": "tQGroup.h", "color": "#fdae6b", "size": "70" },
                         { "name": "tQMainWidget.cpp", "color": "#fdae6b", "size": "72" },
                         { "name": "tQMainWidget.h", "color": "#fdae6b", "size": "80" },
                         { "name": "tQMCAGraph.cpp", "color": "#fdae6b", "size": "531" },
                         { "name": "tQMCAGraph.h", "color": "#fdae6b", "size": "243" },
                         { "name": "tQMCAGraphEdge.cpp", "color": "#fdae6b", "size": "325" },
                         { "name": "tQMCAGraphEdge.h", "color": "#fdae6b", "size": "110" },
                         { "name": "tQMCAGraphNode.cpp", "color": "#fdae6b", "size": "306" },
                         { "name": "tQMCAGraphNode.h", "color": "#fdae6b", "size": "114" },
                         { "name": "tQModule.cpp", "color": "#fdae6b", "size": "159" },
                         { "name": "tQModule.h", "color": "#fdae6b", "size": "69" },
                         { "name": "tQModuleListViewltem.cpp", "color": "#fdae6b", "size": "72" },
                         { "name": "tQModuleListViewltem.h", "color": "#fdae6b", "size": "82" },
                         { "name": "tQModulePortListWidget.cpp", "color": "#fdae6b", "size": "87" },
                         { "name": "tQModulePortListWidget.h", "color": "#fdae6b", "size": "95" },
                         { "name": "tQMultiParameterWidget.cpp", "color": "#fdae6b", "size": "63" },
                         { "name": "tQMultiParameterWidget.h", "color": "#fdae6b", "size": "73" },
                         { "name": "tQParameterWidget.cpp", "color": "#fdae6b", "size": "489" },
                         { "name": "tQParameterWidget.h", "color": "#fdae6b", "size": "129" },
                         { "name": "tQPartContainer.cpp", "color": "#fdae6b", "size": "151" },
                         { "name": "tQPartContainer.h", "color": "#fdae6b", "size": "79" },
                         { "name": "tQPort.cpp", "color": "#fdae6b", "size": "329" },
                         { "name": "tQPort.h", "color": "#fdae6b", "size": "87" },
                         { "name": "tQPortButton.cpp", "color": "#fdae6b", "size": "51" },
                         { "name": "tQPortButton.h", "color": "#fdae6b", "size": "85" },
                         { "name": "tQPortDestination.cpp", "color": "#fdae6b", "size": "474" },
                         { "name": "tQPortDestination.h", "color": "#fdae6b", "size": "185" },
                         { "name": "tQProfile.cpp", "color": "#fdae6b", "size": "149" },
                         { "name": "tQProfile.h", "color": "#fdae6b", "size": "74" },
                         { "name": "tQShortIntSignedValidator.h", "color": "#fdae6b", "size": "174" },
                         { "name": "tQThreadContainer.cpp", "color": "#fdae6b", "size": "86" },
                         { "name": "tQThreadContainer.h", "color": "#fdae6b", "size": "75" },
                         { "name": "tRepBlackboard.cpp", "color": "#fdae6b", "size": "127" },
                         { "name": "tRepBlackboard.h", "color": "#fdae6b", "size": "93" },
                         { "name": "tRepEdge.cpp", "color": "#fdae6b", "size": "502" },
                         { "name": "tRepEdge.h", "color": "#fdae6b", "size": "170" },
                         { "name": "tRepGroup.cpp", "color": "#fdae6b", "size": "503" },
                         { "name": "tRepGroup.h", "color": "#fdae6b", "size": "159" },
                         { "name": "tRepModule.h", "color": "#fdae6b", "size": "453" },
                         { "name": "tRepPartContainer.cpp", "color": "#fdae6b", "size": "82" },
                         { "name": "tRepPartContainer.h", "color": "#fdae6b", "size": "117" },
                         { "name": "tRepThreadContainer.cpp", "color": "#fdae6b", "size": "106" },
                         { "name": "tRepThreadContainer.h", "color": "#fdae6b", "size": "76" },
                         { "name": "tStringBlackboardPlugin.cpp", "color": "#fdae6b", "size": "169" },
                         { "name": "tStringBlackboardPlugin.h", "color": "#fdae6b", "size": "76" }

                      ]
                  },
                  {
                      "name": "gui", "color": "#fd8d3c",
                      "children": [
                         { "name": "ImportExportSymbols.h", "color": "#fdae6b", "size": "49" },
                         { "name": "mcagui.cpp", "color": "#fdae6b", "size": "56" },
                         { "name": "t3DRobotViewer.cpp", "color": "#fdae6b", "size": "190" },
                         { "name": "t3DRobotViewer.h", "color": "#fdae6b", "size": "90" },
                         { "name": "tArtificialHorizon.cpp", "color": "#fdae6b", "size": "189" },
                         { "name": "tArtificialHorizon.h", "color": "#fdae6b", "size": "91" },
                         { "name": "tBar.cpp", "color": "#fdae6b", "size": "307" },
                         { "name": "tBar.h", "color": "#fdae6b", "size": "116" },
                         { "name": "tBitSelector.cpp", "color": "#fdae6b", "size": "205" },
                         { "name": "tBitSelector.h", "color": "#fdae6b", "size": "112" },
                         { "name": "tBlackboardReadUpdateThread.cpp", "color": "#fdae6b", "size": "100" },
                         { "name": "tBlackboardReadUpdateThread.h", "color": "#fdae6b", "size": "72" },
                         { "name": "tBlackboardsize.cpp", "color": "#fdae6b", "size": "149" },
                         { "name": "tBlackboardsize.h", "color": "#fdae6b", "size": "94" },
                         { "name": "tCompass.cpp", "color": "#fdae6b", "size": "231" },
                         { "name": "tCompass.h", "color": "#fdae6b", "size": "91" },
                         { "name": "tConnectlO.cpp", "color": "#fdae6b", "size": "1074" },
                         { "name": "tConnectlO.h", "color": "#fdae6b", "size": "378" },
                         { "name": "tConnectlOChoice.cpp", "color": "#fdae6b", "size": "393" },
                         { "name": "tConnectlOChoice.h", "color": "#fdae6b", "size": "131" },
                         { "name": "tDial.cpp", "color": "#fdae6b", "size": "199" },
                         { "name": "tDial.h", "color": "#fdae6b", "size": "91" },
                         { "name": "tDisplayGlobalIODescription.cpp", "color": "#fdae6b", "size": "114" },
                         { "name": "tDisplayGlobalIODescription.h", "color": "#fdae6b", "size": "83" },
                         { "name": "tDisplayStringFromBlackboard.cpp", "color": "#fdae6b", "size": "218" },
                         { "name": "tDisplayStringFromBlackboard.h", "color": "#fdae6b", "size": "120" },
                         { "name": "tEditWindow.cpp", "color": "#fdae6b", "size": "267" },
                         { "name": "tEditWindow.h", "color": "#fdae6b", "size": "120" },
                         { "name": "tExt3DRobotViewer.cpp", "color": "#fdae6b", "size": "296" },
                         { "name": "tExt3DRobotViewer.h", "color": "#fdae6b", "size": "101" },
                         { "name": "tExtOIRobotViewer.cpp", "color": "#fdae6b", "size": "205" },
                         { "name": "tExtOIRobotViewer.h", "color": "#fdae6b", "size": "98" },
                         { "name": "tFileIO.cpp", "color": "#fdae6b", "size": "113" },
                         { "name": "tFileIO.h", "color": "#fdae6b", "size": "124" },
                         { "name": "tGloballODescriptionsItem.cpp", "color": "#fdae6b", "size": "61" },
                         { "name": "tGloballODescriptionsItem.h", "color": "#fdae6b", "size": "75" },
                         { "name": "tGuiPlugin.h", "color": "#fdae6b", "size": "85" },
                         { "name": "tHelpWindow.cpp", "color": "#fdae6b", "size": "145" },
                         { "name": "tHelpWindow.h", "color": "#fdae6b", "size": "69" },
                         { "name": "tIntegerlnput.cpp", "color": "#fdae6b", "size": "125" },
                         { "name": "tIntegerlnput.h", "color": "#fdae6b", "size": "109" },
                         { "name": "tnameboard.cpp", "color": "#fdae6b", "size": "244" },
                         { "name": "tnameboard.h", "color": "#fdae6b", "size": "107" },
                         { "name": "tLCD.cpp", "color": "#fdae6b", "size": "236" },
                         { "name": "tLCD.h", "color": "#fdae6b", "size": "163" },
                         { "name": "tLED.cpp", "color": "#fdae6b", "size": "269" },
                         { "name": "tLED.h", "color": "#fdae6b", "size": "139" },
                         { "name": "tLogo.cpp", "color": "#fdae6b", "size": "49" },
                         { "name": "tLogo.h", "color": "#fdae6b", "size": "73" },
                         { "name": "tMainWindow.cpp", "color": "#fdae6b", "size": "1103" },
                         { "name": "tMainWindow.h", "color": "#fdae6b", "size": "208" },
                         { "name": "tOptions.cpp", "color": "#fdae6b", "size": "93" },
                         { "name": "tOptions.h", "color": "#fdae6b", "size": "115" },
                         { "name": "tOscilloscope.cpp", "color": "#fdae6b", "size": "324" },
                         { "name": "tOscilloscope.h", "color": "#fdae6b", "size": "85" },
                         { "name": "tPorts.cpp", "color": "#fdae6b", "size": "193" },
                         { "name": "tPorts.h", "color": "#fdae6b", "size": "145" },
                         { "name": "tPushButton.cpp", "color": "#fdae6b", "size": "335" },
                         { "name": "tPushButton.h", "color": "#fdae6b", "size": "118" },
                         { "name": "tQBIackboardCopy.h", "color": "#fdae6b", "size": "86" },
                         { "name": "tQBlackboardCopy.cpp", "color": "#fdae6b", "size": "73" },
                         { "name": "tRadioButtonGroup.cpp", "color": "#fdae6b", "size": "188" },
                         { "name": "tRadioButtonGroup.h", "color": "#fdae6b", "size": "139" },
                         { "name": "tSelectGlobalIODescription.cpp", "color": "#fdae6b", "size": "132" },
                         { "name": "tSelectGlobalIODescription.h", "color": "#fdae6b", "size": "87" },
                         { "name": "tSelectStringFromBlackboard.cpp", "color": "#fdae6b", "size": "119" },
                         { "name": "tSelectStringFromBlackboard.h", "color": "#fdae6b", "size": "103" },
                         { "name": "tSlider.cpp", "color": "#fdae6b", "size": "444" },
                         { "name": "tSlider.h", "color": "#fdae6b", "size": "116" },
                         { "name": "tVaIueInput.h", "color": "#fdae6b", "size": "120" },
                         { "name": "tVaIueVisualizer.cpp", "color": "#fdae6b", "size": "195" },
                         { "name": "tsizeInput.cpp", "color": "#fdae6b", "size": "144" },
                         { "name": "tsizeVisualizer.h", "color": "#fdae6b", "size": "86" },
                         { "name": "tVirtualStick.cpp", "color": "#fdae6b", "size": "229" },
                         { "name": "tVirtualStick.h", "color": "#fdae6b", "size": "83" },
                         { "name": "tWidgetBase.cpp", "color": "#fdae6b", "size": "401" },
                         { "name": "tWidgetBase.h", "color": "#fdae6b", "size": "444" },
                         { "name": "tWidgetBoard.cpp", "color": "#fdae6b", "size": "680" },
                         { "name": "tWidgetBoard.h", "color": "#fdae6b", "size": "237" },
                         { "name": "tWidgetID.h", "color": "#fdae6b", "size": "68" },
                         { "name": "tWidgetType.h", "color": "#fdae6b", "size": "48" },
                         { "name": "tWriteStringToBlackboard.cpp", "color": "#fdae6b", "size": "219" },
                         { "name": "tWriteStringToBlackboard.h", "color": "#fdae6b", "size": "133" }
                      ]
                  },
                  {
                      "name": "edge_collector", "color": "#fd8d3c", "children": [
                           { "name": "gEdgeCollector.cpp", "color": "#fdae6b", "size": 555 },
                           { "name": "gEdgeCollector.h", "color": "#fdae6b", "size": 118 },
                           { "name": "mAutomatedReplay.cpp", "color": "#fdae6b", "size": 454 },
                           { "name": "mAutomatedReplay.h", "color": "#fdae6b", "size": 274 },
                           { "name": "pEdgeCollector.cpp", "color": "#fdae6b", "size": 196 },
                       { "name": "sEdgeCollectorUtils.cpp", "color": "#fdae6b", "size": 323 },
                           { "name": "tCollectedEdges.h", "color": "#fdae6b", "size": 49 },
                           { "name": "sEdgeCollectorUtils.h", "color": "#fdae6b", "size": 101 }
                      ]
                  }
               ]
           },
        {
            "name": "projects", "color": "#3182bd",
            "children": [
               {
                   "name": "test", "color": "#6baed6",
                   "children": [
                      { "name": "bezier_test.cpp", "color": "#9ecae1", "size": "208" },
                      { "name": "gEdgeTest.cpp", "color": "#9ecae1", "size": "394" },
                      { "name": "gEdgeTest.h", "color": "#9ecae1", "size": "393" },
                      { "name": "gExceptionTestGroup.cpp", "color": "#9ecae1", "size": "124" },
                      { "name": "gExceptionTestGroup.h", "color": "#9ecae1", "size": "512" },
                      { "name": "gGeneralTest.cpp", "color": "#9ecae1", "size": "245" },
                      { "name": "gGeneralTest.h", "color": "#9ecae1", "size": "682" },
                      { "name": "gJoyTest.cpp", "color": "#9ecae1", "size": "318" },
                      { "name": "gJoyTest.h", "color": "#9ecae1", "size": "410" },
                      { "name": "gLogging.cpp", "color": "#9ecae1", "size": "126" },
                      { "name": "gLogging.h", "color": "#9ecae1", "size": "140" },
                      { "name": "mBlackboardTest.cpp", "color": "#9ecae1", "size": "248" },
                      { "name": "mBlackboardTest.h", "color": "#9ecae1", "size": "200" },
                      { "name": "mBlackboardThreadTest.cpp", "color": "#9ecae1", "size": "181" },
                      { "name": "mBlackboardThreadTest.h", "color": "#9ecae1", "size": "174" },
                      { "name": "mExceptionTest.cpp", "color": "#9ecae1", "size": "325" },
                      { "name": "mExceptionTest.h", "color": "#9ecae1", "size": "81" },
                      { "name": "mIODescriptionTest.cpp", "color": "#9ecae1", "size": "306" },
                      { "name": "mIODescriptionTest.h", "color": "#9ecae1", "size": "179" },
                      { "name": "mParameterTest.cpp", "color": "#9ecae1", "size": "236" },
                      { "name": "mParameterTest.h", "color": "#9ecae1", "size": "157" },
                      { "name": "mTerminateSelf.cpp", "color": "#9ecae1", "size": "910" },
                      { "name": "mTerminateSelf.h", "color": "#9ecae1", "size": "310" },
                      { "name": "mTestHighResolutionEncoder.cpp", "color": "#9ecae1", "size": "5377" },
                      { "name": "mTestHighResolutionEncoder.h", "color": "#9ecae1", "size": "399" },
                      { "name": "mTimeTest.cpp", "color": "#9ecae1", "size": "660" },
                      { "name": "mTimeTest.h", "color": "#9ecae1", "size": "230" },
                      { "name": "pBlackboardTest.cpp", "color": "#9ecae1", "size": "185" },
                      { "name": "pBlackboardThreadTest.cpp", "color": "#9ecae1", "size": "142" },
                      { "name": "pEdgeTest.cpp", "color": "#9ecae1", "size": "174" },
                      { "name": "pExceptionTest.cpp", "color": "#9ecae1", "size": "2484" },
                      { "name": "pExceptionTestGroup.cpp", "color": "#9ecae1", "size": "310" },
                      { "name": "pGeneralTest.cpp", "color": "#9ecae1", "size": "132" },
                      { "name": "pInterpartEdgesTest.cpp", "color": "#9ecae1", "size": "142" },
                      { "name": "pIODescriptionTest.cpp", "color": "#9ecae1", "size": "327" },
                      { "name": "pJoyTest.cpp", "color": "#9ecae1", "size": "211" },
                      { "name": "pLogging.cpp", "color": "#9ecae1", "size": "97" },
                      { "name": "pParameterTest.cpp", "color": "#9ecae1", "size": "94" },
                      { "name": "pPasschildren.cpp", "color": "#9ecae1", "size": "334" },
                      { "name": "pReplychildren.cpp", "color": "#9ecae1", "size": "166" },
                      { "name": "pTerminateSelf.cpp", "color": "#9ecae1", "size": "150" },
                      { "name": "pTestHighResolutionEncoder.cpp", "color": "#9ecae1", "size": "242" },
                      { "name": "pTimeTest.cpp", "color": "#9ecae1", "size": "154" }
                   ]
               },

               {
                   "name": "ravon", "color": "#6baed6",
                   "children": [
                      {
                          "name": "base", "color": "#9ecae1",
                          "children": [
                             { "name": "gBaseVisualization.cpp", "color": "#c6dbef", "size": "170" },
                             { "name": "gBaseVisualization.h", "color": "#c6dbef", "size": "108" },
                             { "name": "gCanCommunicationWithBamobil.cpp", "color": "#c6dbef", "size": "121" },
                             { "name": "gCanCommunicationWithBamobil.h", "color": "#c6dbef", "size": "212" },
                             { "name": "gHardwareInterface.cpp", "color": "#c6dbef", "size": "116" },
                             { "name": "gHardwareInterface.h", "color": "#c6dbef", "size": "663" },
                             { "name": "gKinematicGroup.cpp", "color": "#c6dbef", "size": "135" },
                             { "name": "gKinematicGroup.h", "color": "#c6dbef", "size": "229" },
                             { "name": "gRavonBase.cpp", "color": "#c6dbef", "size": "158" },
                             { "name": "gRavonBase.h", "color": "#c6dbef", "size": "944" },
                             { "name": "gRavonHAL.cpp", "color": "#c6dbef", "size": "438" },
                             { "name": "gRavonHAL.h", "color": "#c6dbef", "size": "67" },
                             { "name": "gRavonJoystickControl.cpp", "color": "#c6dbef", "size": "251" },
                             { "name": "gRavonJoystickControl.h", "color": "#c6dbef", "size": "127" },
                             { "name": "gTestControllerBridgeReal.cpp", "color": "#c6dbef", "size": "157" },
                             { "name": "gTestControllerBridgeReal.h", "color": "#c6dbef", "size": "402" },
                             { "name": "gTestControllerBridgeSimulation.cpp", "color": "#c6dbef", "size": "258" },
                             { "name": "gTestControllerBridgeSimulation.h", "color": "#c6dbef", "size": "361" },
                             { "name": "gTestControllersReal.cpp", "color": "#c6dbef", "size": "259" },
                             { "name": "gTestControllersReal.h", "color": "#c6dbef", "size": "388" },
                             { "name": "gTestDSPs.cpp", "color": "#c6dbef", "size": "258" },
                             { "name": "gTestDSPs.h", "color": "#c6dbef", "size": "311" },
                             { "name": "m3DScannerMotorDriver.cpp", "color": "#c6dbef", "size": "110" },
                             { "name": "m3DScannerMotorDriver.h", "color": "#c6dbef", "size": "267" },
                             { "name": "mBamobilDriver.cpp", "color": "#c6dbef", "size": "173" },
                             { "name": "mBamobilDriver.h", "color": "#c6dbef", "size": "1043" },
                             { "name": "mBumperSCORecovery.cpp", "color": "#c6dbef", "size": "391" },
                             { "name": "mBumperSCORecovery.h", "color": "#c6dbef", "size": "229" },
                             { "name": "mCalculateMaxPossibleVelocity.cpp", "color": "#c6dbef", "size": "191" },
                             { "name": "mCalculateMaxPossibleVelocity.h", "color": "#c6dbef", "size": "133" },
                             { "name": "mControllerBridge.cpp", "color": "#c6dbef", "size": "136" },
                             { "name": "mControllerBridge.h", "color": "#c6dbef", "size": "899" },
                             { "name": "mDeIayBackwardMotion.cpp", "color": "#c6dbef", "size": "463" },
                             { "name": "mDelayBackwardMotion.h", "color": "#c6dbef", "size": "166" },
                             { "name": "mDSPBridge.cpp", "color": "#c6dbef", "size": "142" },
                             { "name": "mDSPBridge.h", "color": "#c6dbef", "size": "714" },
                             { "name": "mPoseCollector.cpp", "color": "#c6dbef", "size": "333" },
                             { "name": "mPoseCollector.h", "color": "#c6dbef", "size": "251" },
                             { "name": "mRavonConstraints.cpp", "color": "#c6dbef", "size": "143" },
                             { "name": "mRavonConstraints.h", "color": "#c6dbef", "size": "274" },
                             { "name": "mSteeringKinematics.cpp", "color": "#c6dbef", "size": "158" },
                             { "name": "mSteeringKinematics.h", "color": "#c6dbef", "size": "215" },
                             { "name": "mStepperControl.cpp", "color": "#c6dbef", "size": "135" },
                             { "name": "mStepperControl.h", "color": "#c6dbef", "size": "617" },
                             { "name": "mVeIocityKinematics.cpp", "color": "#c6dbef", "size": "368" },
                             { "name": "mVelocityKinematics.h", "color": "#c6dbef", "size": "228" },
                             { "name": "mWERMALightControl.cpp", "color": "#c6dbef", "size": "138" },
                             { "name": "mWERMALightControl.h", "color": "#c6dbef", "size": "244" },
                             { "name": "pCanCommunicationWithBamobil.cpp", "color": "#c6dbef", "size": "180" },
                             { "name": "pDSPsOnly.cpp", "color": "#c6dbef", "size": "139" },
                             { "name": "pRavonBase.cpp", "color": "#c6dbef", "size": "104" },
                             { "name": "pTestBamobiIDriver.cpp", "color": "#c6dbef", "size": "169" },
                             { "name": "pTestBamobiIDriverModule.cpp", "color": "#c6dbef", "size": "98" },
                             { "name": "pTestControllerBridgeReal.cpp", "color": "#c6dbef", "size": "120" },
                             { "name": "pTestControllerBridgeSimulation.cpp", "color": "#c6dbef", "size": "97" },
                             { "name": "pTestControllersReal.cpp", "color": "#c6dbef", "size": "97" },
                             { "name": "set_werma_light.cpp", "color": "#c6dbef", "size": "97" },
                             { "name": "tBamobilDriver.cpp", "color": "#c6dbef", "size": "100" },
                             { "name": "tBamobilDriver.h", "color": "#c6dbef", "size": "1071" },
                             { "name": "tPoseCollectorAppenderDefinitions.cpp", "color": "#c6dbef", "size": "496" },
                             { "name": "tRavonBaseDefinitions.cpp", "color": "#c6dbef", "size": "57" },
                             { "name": "tRavonBaseDefinitions.h", "color": "#c6dbef", "size": "66" }
                          ]
                      },

                      {
                          "name": "control", "color": "#9ecae1",
                          "children": [
                             { "name": "gbbLocalPathPlanner.cpp", "color": "#c6dbef", "size": "365" },
                             { "name": "gbbSlowDownSideward.h", "color": "#c6dbef", "size": "78" },
                             { "name": "mbbFollowObject.h", "color": "#c6dbef", "size": "144" },
                             { "name": "pRavonControlNavigator.cpp", "color": "#c6dbef", "size": "165" },
                             { "name": "gbbAlgorithmBasedEvasion.h", "color": "#c6dbef", "size": "82" },
                             { "name": "gbbAlgorithmBasedEvasion.hpp", "color": "#c6dbef", "size": "120" },
                             { "name": "gbbAlgorithmBasedKeepDistanceRotation.h", "color": "#c6dbef", "size": "73" },
                             { "name": "gbbAlgorithmBasedKeepDistanceRotation.hpp", "color": "#c6dbef", "size": "110" },
                             { "name": "gbbAlgorithmBasedKeepDistancesideward.h", "color": "#c6dbef", "size": "71" },
                             { "name": "gbbAlgorithmBasedKeepDistanceSideward.hpp", "color": "#c6dbef", "size": "97" },
                             { "name": "gbbAlgorithmBasedSIowDown2DFrontRear.h", "color": "#c6dbef", "size": "75" },
                             { "name": "gbbAlgorithmBasedSIowDown3DFrontRear.h", "color": "#c6dbef", "size": "75" },
                             { "name": "gbbAlgorithmBasedSlowDown2DFrontRear.hpp", "color": "#c6dbef", "size": "102" },
                             { "name": "gbbAlgorithmBasedSlowDown2DSideward.h", "color": "#c6dbef", "size": "75" },
                             { "name": "gbbAlgorithmBasedSlowDown2DSideward.hpp", "color": "#c6dbef", "size": "98" },
                             { "name": "gbbAlgorithmBasedSlowDown3DFrontRear.hpp", "color": "#c6dbef", "size": "151" },
                             { "name": "gbbAlgorithmBasedSlowDown3DSideward.h", "color": "#c6dbef", "size": "76" },
                             { "name": "gbbAlgorithmBasedSlowDown3DSideward.hpp", "color": "#c6dbef", "size": "108" },
                             { "name": "gbbAspectBasedSafetyControI.cpp", "color": "#c6dbef", "size": "946" },
                             { "name": "gbbAspectBasedSafetyControI.h", "color": "#c6dbef", "size": "191" },
                             { "name": "gbbdoysticklnterpretation.cpp", "color": "#c6dbef", "size": "432" },
                             { "name": "gbbdoysticklnterpretation.h", "color": "#c6dbef", "size": "281" },
                             { "name": "gbbEmergencyStop.cpp", "color": "#c6dbef", "size": "122" },
                             { "name": "gbbEmergencystop.h", "color": "#c6dbef", "size": "102" },
                             { "name": "gbbEvasion.cpp", "color": "#c6dbef", "size": "264" },
                             { "name": "gbbEvasion.h", "color": "#c6dbef", "size": "98" },
                             { "name": "gbbEvasionInterface.h", "color": "#c6dbef", "size": "179" },
                             { "name": "gbbFollowObject.cpp", "color": "#c6dbef", "size": "125" },
                             { "name": "gbbFollowObject.h", "color": "#c6dbef", "size": "116" },
                             { "name": "gbbForwardInclinationStop.cpp", "color": "#c6dbef", "size": "75" },
                             { "name": "gbbForwardInclinationStop.h", "color": "#c6dbef", "size": "102" },
                             { "name": "gbbGUIJoystickControl.cpp", "color": "#c6dbef", "size": "432" },
                             { "name": "gbbGUIJoystickControl.h", "color": "#c6dbef", "size": "274" },
                             { "name": "gbbJoystickControl.cpp", "color": "#c6dbef", "size": "188" },
                             { "name": "gbbJoystickControl.h", "color": "#c6dbef", "size": "252" },
                             { "name": "gbbJoystickProxy.cpp", "color": "#c6dbef", "size": "196" },
                             { "name": "gbbJoystickProxy.h", "color": "#c6dbef", "size": "171" },
                             { "name": "gbbKeepDistanceInterface.h", "color": "#c6dbef", "size": "155" },
                             { "name": "gbbKeepDistanceRotation.cpp", "color": "#c6dbef", "size": "198" },
                             { "name": "gbbKeepDistanceRotation.h", "color": "#c6dbef", "size": "70" },
                             { "name": "gbbKeepDistanceSideward.cpp", "color": "#c6dbef", "size": "150" },
                             { "name": "gbbKeepDistanceSideward.h", "color": "#c6dbef", "size": "70" },
                             { "name": "gbbLocalPathPlanner.h", "color": "#c6dbef", "size": "215" },
                             { "name": "gbbRavonLocalPathPlanner.cpp", "color": "#c6dbef", "size": "372" },
                             { "name": "gbbRavonLocalPathPlanner.h", "color": "#c6dbef", "size": "214" },
                             { "name": "gbbSafetyControI.cpp", "color": "#c6dbef", "size": "1680" },
                             { "name": "gbbSafetyControl.h", "color": "#c6dbef", "size": "221" },
                             { "name": "gbbSanityMonitor.h", "color": "#c6dbef", "size": "202" },
                             { "name": "gbbSanityMonitor.hpp", "color": "#c6dbef", "size": "203" },
                             { "name": "gbbSlowDownFrontRear.cpp", "color": "#c6dbef", "size": "102" },
                             { "name": "gbbSlowDownFrontRear.h", "color": "#c6dbef", "size": "70" },
                             { "name": "gbbSlowDownInterface.h", "color": "#c6dbef", "size": "157" },
                             { "name": "gbbSlowDownSideward.cpp", "color": "#c6dbef", "size": "154" },
                             { "name": "gCacheRemoteBlackboards.cpp", "color": "#c6dbef", "size": "150" },
                             { "name": "gCacheRemoteBlackboards.h", "color": "#c6dbef", "size": "160" },
                             { "name": "gDirectJoystickControl.cpp", "color": "#c6dbef", "size": "508" },
                             { "name": "gDirectJoystickControl.h", "color": "#c6dbef", "size": "184" },
                             { "name": "gDriveControl.cpp", "color": "#c6dbef", "size": "1771" },
                             { "name": "gDriveControl.h", "color": "#c6dbef", "size": "453" },
                             { "name": "gDriveControlConversion.cpp", "color": "#c6dbef", "size": "82" },
                             { "name": "gDriveControlConversion.h", "color": "#c6dbef", "size": "131" },
                             { "name": "gJoystickOutputConversion.cpp", "color": "#c6dbef", "size": "134" },
                             { "name": "gJoystickOutputConversion.h", "color": "#c6dbef", "size": "153" },
                             { "name": "gPointAccessVisualisation.cpp", "color": "#c6dbef", "size": "222" },
                             { "name": "gPointAccessVisualisation.h", "color": "#c6dbef", "size": "236" },
                             { "name": "gPrepareRobotPose.cpp", "color": "#c6dbef", "size": "147" },
                             { "name": "gPrepareRobotPose.h", "color": "#c6dbef", "size": "172" },
                             { "name": "gPrepareTargetPose.cpp", "color": "#c6dbef", "size": "147" },
                             { "name": "gPrepareTargetPose.h", "color": "#c6dbef", "size": "172" },
                             { "name": "gRavonBaseControl.cpp", "color": "#c6dbef", "size": "418" },
                             { "name": "gRavonBaseControl.h", "color": "#c6dbef", "size": "288" },
                             { "name": "gRavonControl.cpp", "color": "#c6dbef", "size": "496" },
                             { "name": "gRavonControl.h", "color": "#c6dbef", "size": "366" },
                             { "name": "gRavonControlNavigator.cpp", "color": "#c6dbef", "size": "171" },
                             { "name": "gRavonControlNavigator.h", "color": "#c6dbef", "size": "163" },
                             { "name": "gRavonDriveControlNavigator.cpp", "color": "#c6dbef", "size": "308" },
                             { "name": "gRavonDriveControlNavigator.h", "color": "#c6dbef", "size": "188" },
                             { "name": "gRavonElasticBandAnalyzer.cpp", "color": "#c6dbef", "size": "146" },
                             { "name": "gRavonElasticBandAnalyzer.h", "color": "#c6dbef", "size": "137" },
                             { "name": "gRavonsensorProcessingAndSafetyControl.cpp", "color": "#c6dbef", "size": "474" },
                             { "name": "gRavonSensorProcessingAndSafetyControl.h", "color": "#c6dbef", "size": "207" },
                             { "name": "mbbBackward.cpp", "color": "#c6dbef", "size": "117" },
                             { "name": "mbbBackward.h", "color": "#c6dbef", "size": "131" },
                             { "name": "mbbBumperStop.cpp", "color": "#c6dbef", "size": "218" },
                             { "name": "mbbBumperStop.h", "color": "#c6dbef", "size": "192" },
                             { "name": "mbbDriveMode.cpp", "color": "#c6dbef", "size": "257" },
                             { "name": "mbbDriveMode.h", "color": "#c6dbef", "size": "217" },
                             { "name": "mbbEmergencyStopHighInclination.cpp", "color": "#c6dbef", "size": "127" },
                             { "name": "mbbEmergencyStopHighInclination.h", "color": "#c6dbef", "size": "134" },
                             { "name": "mbbEvasion.h", "color": "#c6dbef", "size": "200" },
                             { "name": "mbbEvasion.hpp", "color": "#c6dbef", "size": "214" },
                             { "name": "mbbEvasionInterface.h", "color": "#c6dbef", "size": "47" },
                             { "name": "mbbEvasionStateSwitching.cpp", "color": "#c6dbef", "size": "192" },
                             { "name": "mbbEvasionStateSwitching.h", "color": "#c6dbef", "size": "148" },
                             { "name": "mbbFollowObject.cpp", "color": "#c6dbef", "size": "209" },
                             { "name": "mbbForward.cpp", "color": "#c6dbef", "size": "117" },
                             { "name": "mbbForward.h", "color": "#c6dbef", "size": "129" },
                             { "name": "mbbForwardPointAccessWithOrientation.cpp", "color": "#c6dbef", "size": "341" },
                             { "name": "mbbForwardPointAccessWithOrientation.h", "color": "#c6dbef", "size": "210" },
                             { "name": "mbbGenerateColourOutput.cpp", "color": "#c6dbef", "size": "174" },
                             { "name": "mbbGenerateColourOutput.h", "color": "#c6dbef", "size": "192" },
                             { "name": "mbbJoystickMotionControl.cpp", "color": "#c6dbef", "size": "176" },
                             { "name": "mbbJoystickMotionControl.h", "color": "#c6dbef", "size": "139" },
                             { "name": "mbbKeepDistancelnterface.h", "color": "#c6dbef", "size": "60" },
                             { "name": "mbbKeepDistanceRotation.h", "color": "#c6dbef", "size": "243" },
                             { "name": "mbbKeepDistanceRotation.hpp", "color": "#c6dbef", "size": "311" },
                             { "name": "mbbKeepDistanceSideward.h", "color": "#c6dbef", "size": "204" },
                             { "name": "mbbKeepDistanceSideward.hpp", "color": "#c6dbef", "size": "197" },
                             { "name": "mbbLimitDeceleration.cpp", "color": "#c6dbef", "size": "235" },
                             { "name": "mbbLimitDeceleration.h", "color": "#c6dbef", "size": "167" },
                             { "name": "mbbMotionAdaptation.cpp", "color": "#c6dbef", "size": "334" },
                             { "name": "mbbMotionAdaptation.h", "color": "#c6dbef", "size": "164" },
                             { "name": "mbbPipeThrough.cpp", "color": "#c6dbef", "size": "108" },
                             { "name": "mbbPipeThrough.h", "color": "#c6dbef", "size": "129" },
                             { "name": "mbbRotateLeft.cpp", "color": "#c6dbef", "size": "117" },
                             { "name": "mbbRotateLeft.h", "color": "#c6dbef", "size": "129" },
                             { "name": "mbbRotateRight.cpp", "color": "#c6dbef", "size": "117" },
                             { "name": "mbbRotateRight.h", "color": "#c6dbef", "size": "129" },
                             { "name": "mbbRotationControlOutput.cpp", "color": "#c6dbef", "size": "133" },
                             { "name": "mbbRotationControlOutput.h", "color": "#c6dbef", "size": "135" },
                             { "name": "mbbSidewardControlOutput.cpp", "color": "#c6dbef", "size": "133" },
                             { "name": "mbbSidewardControlOutput.h", "color": "#c6dbef", "size": "135" },
                             { "name": "mbbSidewardLeft.cpp", "color": "#c6dbef", "size": "117" },
                             { "name": "mbbSidewardLeft.h", "color": "#c6dbef", "size": "129" },
                             { "name": "mbbSidewardPointAccess.cpp", "color": "#c6dbef", "size": "247" },
                             { "name": "mbbSidewardPointAccess.h", "color": "#c6dbef", "size": "163" },
                             { "name": "mbbSidewardRight.cpp", "color": "#c6dbef", "size": "117" },
                             { "name": "mbbSidewardRight.h", "color": "#c6dbef", "size": "129" },
                             { "name": "mbbSlowDown.h", "color": "#c6dbef", "size": "215" },
                             { "name": "mbbSlowDown.hpp", "color": "#c6dbef", "size": "200" },
                             { "name": "mbbSlowDownCartesian.cpp", "color": "#c6dbef", "size": "115" },
                             { "name": "mbbSlowDownCartesian.h", "color": "#c6dbef", "size": "138" },
                             { "name": "mbbSlowDownInterface.cpp", "color": "#c6dbef", "size": "2" },
                             { "name": "mbbSlowDownInterface.h", "color": "#c6dbef", "size": "53" },
                             { "name": "mbbSlowDownPolar.cpp", "color": "#c6dbef", "size": "120" },
                             { "name": "mbbSlowDownPolar.h", "color": "#c6dbef", "size": "138" },
                             { "name": "mbbTraceBack.cpp", "color": "#c6dbef", "size": "201" },
                             { "name": "mbbTraceBack.h", "color": "#c6dbef", "size": "167" },
                             { "name": "mbbTurnToLeftObject.cpp", "color": "#c6dbef", "size": "134" },
                             { "name": "mbbTurnToLeftObject.h", "color": "#c6dbef", "size": "136" },
                             { "name": "mbbTurnToRightObject.cpp", "color": "#c6dbef", "size": "134" },
                             { "name": "mbbTurnToRightObject.h", "color": "#c6dbef", "size": "136" },
                             { "name": "mbbVelocityControlOutput.cpp", "color": "#c6dbef", "size": "128" },
                             { "name": "mbbVelocityControlOutput.h", "color": "#c6dbef", "size": "130" },
                             { "name": "mCountOnTrigger.cpp", "color": "#c6dbef", "size": "135" },
                             { "name": "mCountOnTrigger.h", "color": "#c6dbef", "size": "133" },
                             { "name": "mInterpretJoystickButtons.cpp", "color": "#c6dbef", "size": "260" },
                             { "name": "mInterpretJoystickButtons.h", "color": "#c6dbef", "size": "197" },
                             { "name": "mInvertBackwardSteering.cpp", "color": "#c6dbef", "size": "123" },
                             { "name": "mJoystickVelocityMerge.cpp", "color": "#c6dbef", "size": "112" },
                             { "name": "mJoystickVelocityMerge.h", "color": "#c6dbef", "size": "150" },
                             { "name": "mlnvertBackwardSteering.h", "color": "#c6dbef", "size": "136" },
                             { "name": "mNormVelocity.cpp", "color": "#c6dbef", "size": "115" },
                             { "name": "mNormVelocity.h", "color": "#c6dbef", "size": "126" },
                             { "name": "mOnlineStateAnalyser.cpp", "color": "#c6dbef", "size": "498" },
                             { "name": "mOnlineStateAnalyser.h", "color": "#c6dbef", "size": "274" },
                             { "name": "mPointAccessVisualiser.cpp", "color": "#c6dbef", "size": "424" },
                             { "name": "mPointAccessVisualiser.h", "color": "#c6dbef", "size": "281" },
                             { "name": "mPoseTransformation.cpp", "color": "#c6dbef", "size": "197" },
                             { "name": "mPoseTransformation.h", "color": "#c6dbef", "size": "181" },
                             { "name": "mRavonElasticBandAnalyzer.h", "color": "#c6dbef", "size": "298" },
                             { "name": "mRavonElasticBandAnalyzer.hpp", "color": "#c6dbef", "size": "770" },
                             { "name": "mRavonLocalPathPlanner.h", "color": "#c6dbef", "size": "594" },
                             { "name": "mRavonLocalPathPlanner.hpp", "color": "#c6dbef", "size": "1336" },
                             { "name": "mSteeringConversion.cpp", "color": "#c6dbef", "size": "227" },
                             { "name": "mSteeringConversion.h", "color": "#c6dbef", "size": "168" },
                             { "name": "mSwitchJoystickOutput.cpp", "color": "#c6dbef", "size": "142" },
                             { "name": "mSwitchJoystickOutput.h", "color": "#c6dbef", "size": "165" },
                             { "name": "mVelocityScaling.cpp", "color": "#c6dbef", "size": "106" },
                             { "name": "mVelocityScaling.h", "color": "#c6dbef", "size": "149" },
                             { "name": "pDirectJoystickControl.cpp", "color": "#c6dbef", "size": "96" },
                             { "name": "pRavonBaseControl.cpp", "color": "#c6dbef", "size": "259" },
                             { "name": "pRavonDriveControlNavigator.cpp", "color": "#c6dbef", "size": "227" },
                             { "name": "pRavonSensorProcessingAndSafetyControl.cpp", "color": "#c6dbef", "size": "189" },
                             { "name": "sBehaviourFactory.cpp", "color": "#c6dbef", "size": "169" },
                             { "name": "sBehaviourFactory.h", "color": "#c6dbef", "size": "36" },
                             { "name": "sEdgesToBeLogged.cpp", "color": "#c6dbef", "size": "1732" },
                             { "name": "sEdgesToBeLogged.h", "color": "#c6dbef", "size": "108" },
                             { "name": "sObservedBaseControlEdges.cpp", "color": "#c6dbef", "size": "1092" },
                             { "name": "sObservedBaseControlEdges.h", "color": "#c6dbef", "size": "108" },
                             { "name": "tCacheGroupSingletonFactory.h", "color": "#c6dbef", "size": "57" },
                             { "name": "tPathPIanningGridMapBaseDefinitions.h", "color": "#c6dbef", "size": "60" },
                             { "name": "tPathPlanningGridMapCell.cpp", "color": "#c6dbef", "size": "64" },
                             { "name": "tPathPlanningGridMapCell.h", "color": "#c6dbef", "size": "239" },
                             { "name": "tPathPlanningGridMapDefinitions.h", "color": "#c6dbef", "size": "107" },
                             { "name": "tPathPlanningGridMapDefinitions.hpp", "color": "#c6dbef", "size": "36" },
                             { "name": "tRavonControlDefinitions.cpp", "color": "#c6dbef", "size": "64" },
                             { "name": "tRavonControlDefinitions.h", "color": "#c6dbef", "size": "98" }
                          ]
                      },

                      {
                          "name": "navigator", "color": "#9ecae1",
                          "children": [
                             { "name": "Attribute.h", "color": "#c6dbef", "size": "270" },
                             { "name": "convert_wgs84_to_ecef.cpp", "color": "#c6dbef", "size": "93" },
                             { "name": "gRavonNavigationVisualizer.cpp", "color": "#c6dbef", "size": "103" },
                             { "name": "gRavonNavigationvisualizer.h", "color": "#c6dbef", "size": "326" },
                             { "name": "gRavonNavigator.cpp", "color": "#c6dbef", "size": "93" },
                             { "name": "gRavonNavigator.h", "color": "#c6dbef", "size": "139" },
                             { "name": "mbbReachPos.cpp", "color": "#c6dbef", "size": "326" },
                             { "name": "mbbReachPos.h", "color": "#c6dbef", "size": "195" },
                             { "name": "mBoundaryVisualizer.cpp", "color": "#c6dbef", "size": "145" },
                             { "name": "mBoundaryvisualizer.h", "color": "#c6dbef", "size": "141" },
                             { "name": "mColorBlobFollowing.cpp", "color": "#c6dbef", "size": "258" },
                             { "name": "mColorBlobFollowing.h", "color": "#c6dbef", "size": "177" },
                             { "name": "mConvertECEF_WGS84.cpp", "color": "#c6dbef", "size": "223" },
                             { "name": "mConvertECEF_WGS84.h", "color": "#c6dbef", "size": "854" },
                             { "name": "mDummyFollowing.cpp", "color": "#c6dbef", "size": "153" },
                             { "name": "mDummyFollowing.h", "color": "#c6dbef", "size": "101" },
                             { "name": "mEdgeRater.cpp", "color": "#c6dbef", "size": "160" },
                             { "name": "mEdgeRater.h", "color": "#c6dbef", "size": "169" },
                             { "name": "mMapLearner.cpp", "color": "#c6dbef", "size": "209" },
                             { "name": "mMapLearner.h", "color": "#c6dbef", "size": "384" },
                             { "name": "mMapMarker.cpp", "color": "#c6dbef", "size": "330" },
                             { "name": "mMapMarker.h", "color": "#c6dbef", "size": "1092" },
                             { "name": "mMapVisualizer.cpp", "color": "#c6dbef", "size": "774" },
                             { "name": "mMapVisualizer.h", "color": "#c6dbef", "size": "240" },
                             { "name": "mNavigationController.cpp", "color": "#c6dbef", "size": "91" },
                             { "name": "mNavigationController.h", "color": "#c6dbef", "size": "102" },
                             { "name": "mNodeLocator.cpp", "color": "#c6dbef", "size": "157" },
                             { "name": "mNodeLocator.h", "color": "#c6dbef", "size": "108" },
                             { "name": "mPoseAppender.cpp", "color": "#c6dbef", "size": "163" },
                             { "name": "mPoseAppender.h", "color": "#c6dbef", "size": "160" },
                             { "name": "mRandomExplorer.cpp", "color": "#c6dbef", "size": "106" },
                             { "name": "mRandomExplorer.h", "color": "#c6dbef", "size": "372" },
                             { "name": "mRemoteControl.cpp", "color": "#c6dbef", "size": "187" },
                             { "name": "mRemoteControl.h", "color": "#c6dbef", "size": "132" },
                             { "name": "mSetVisualizationOffset.cpp", "color": "#c6dbef", "size": "99" },
                             { "name": "mSetvisualizationoffset.h", "color": "#c6dbef", "size": "132" },
                             { "name": "mTouristExplorer.cpp", "color": "#c6dbef", "size": "111" },
                             { "name": "mTouristExplorer.h", "color": "#c6dbef", "size": "317" },
                             { "name": "offlineEdgeRater.cpp", "color": "#c6dbef", "size": "125" },
                             { "name": "postprocess_roi.cpp", "color": "#c6dbef", "size": "240" },
                             { "name": "pRavonNavigator.cpp", "color": "#c6dbef", "size": "118" },
                             { "name": "pTestBoundary.cpp", "color": "#c6dbef", "size": "85" },
                             { "name": "tEdgeRater.cpp", "color": "#c6dbef", "size": "181" },
                             { "name": "tEdgeRater.h", "color": "#c6dbef", "size": "203" },
                             { "name": "tNavigationCommand.cpp", "color": "#c6dbef", "size": "200" },
                             { "name": "tNavigationCommand.h", "color": "#c6dbef", "size": "165" },
                             { "name": "tPOIDetectionDefinitions.h", "color": "#c6dbef", "size": "170" },
                             { "name": "tPointOfInterestMap.cpp", "color": "#c6dbef", "size": "151" },
                             { "name": "tPointOfInterestMap.h", "color": "#c6dbef", "size": "131" }
                          ]
                      },
                      {
                          "name": "obstacle_detection", "color": "#9ecae1",
                          "children": [
                             { "name": "gAbstractSensorFusion.cpp", "color": "#c6dbef", "size": "1054" },
                             { "name": "gAbstractSensorFusion.h", "color": "#c6dbef", "size": "500" },
                             { "name": "gCanCommunicationWithBamobilSimuIation.cpp", "color": "#c6dbef", "size": "136" },
                             { "name": "gCanCommunicationWithBamobilSimuIation.h", "color": "#c6dbef", "size": "51" },
                             { "name": "gDispIayGridAndSectorMapsAndScannerData2D.h", "color": "#c6dbef", "size": "127" },
                             { "name": "gDispIayGridAndSectorMapsAndScannerData2D.hpp", "color": "#c6dbef", "size": "64" },
                             { "name": "gRavon3DLaserObstacleDetection.hpp", "color": "#c6dbef", "size": "51" },
                             { "name": "gSemanticAbstraction.cpp", "color": "#c6dbef", "size": "118" },
                             { "name": "gSemanticAbstraction.h", "color": "#c6dbef", "size": "138" },
                             { "name": "gSemanticTranslation.cpp", "color": "#c6dbef", "size": "58" },
                             { "name": "gSemanticTranslation.h", "color": "#c6dbef", "size": "49" },
                             { "name": "gSensorProcessing.cpp", "color": "#c6dbef", "size": "89" },
                             { "name": "gSensorProcessing.h", "color": "#c6dbef", "size": "59" },
                             { "name": "gSensorProcessingAndFusion.cpp", "color": "#c6dbef", "size": "145" },
                             { "name": "gSensorProcessingAndFusion.h", "color": "#c6dbef", "size": "135" },
                             { "name": "mDisplayRavon.h", "color": "#c6dbef", "size": "212" },
                             { "name": "mDisplayRavon.hpp", "color": "#c6dbef", "size": "171" },
                             { "name": "pRavonSensorProcessingAndFusion.cpp", "color": "#c6dbef", "size": "279" },
                             { "name": "tObstacleDetectionMode.h", "color": "#c6dbef", "size": "148" },
                             { "name": "tRavonAbstractSensorFusionDefinitions.cpp", "color": "#c6dbef", "size": "224" },
                             { "name": "tRavonAbstractSensorFusionDefinitions.h", "color": "#c6dbef", "size": "164" },
                             { "name": "tRavonAbstractSensorFusionSectorMapDefinitions.h", "color": "#c6dbef", "size": "206" },
                             { "name": "tRavonAspectsDefinitions.cpp", "color": "#c6dbef", "size": "194" },
                             { "name": "tRavonAspectsDefinitions.h", "color": "#c6dbef", "size": "190" },
                             { "name": "tRavonDisplayDefinitions.h", "color": "#c6dbef", "size": "191" },
                             { "name": "tRavonSemanticTranslationDefinitions.h", "color": "#c6dbef", "size": "954" },
                             { "name": "tRavonTranslationFactory.cpp", "color": "#c6dbef", "size": "281" },
                             { "name": "tRavonTranslationFactory.h", "color": "#c6dbef", "size": "190" },
                             { "name": "utilcutpan_scan.cpp", "color": "#c6dbef", "size": "164" }
                          ]
                      }
                   ]
               }
            ]
        },
        {
            "name": "libraries", "color": "#756bb1",
            "children": [

               {
                   "name": "behaviour", "color": "#9e9ac8",
                   "children": [

                      { "name": "mbbChangedCounterFusionBehaviour.cpp", "color": "#bcbddc", "size": "204" },
                      { "name": "mbbChangedCounterFusionBehaviour.h", "color": "#bcbddc", "size": "190" },
                      { "name": "mbbConditionalBehaviourStimulatoncpp", "color": "#bcbddc", "size": "595" },
                      { "name": "mbbConditionalBehaviourStimulator.h", "color": "#bcbddc", "size": "428" },
                      { "name": "mbbEnableControlOutQut.cgp", "color": "#bcbddc", "size": "149" },
                      { "name": "mbbEnableControlOutQut.h", "color": "#bcbddc", "size": "158" },
                      { "name": "mbbExclusionBehaviour.cpp", "color": "#bcbddc", "size": "219" },
                      { "name": "mbbExclusionBehaviour.h", "color": "#bcbddc", "size": "185" },
                      { "name": "mbbFusionBehaviour.cpp", "color": "#bcbddc", "size": "470" },
                      { "name": "mbbFusionBehaviour.h", "color": "#bcbddc", "size": "321" },
                      { "name": "mbbOutputLimitation.cpp", "color": "#bcbddc", "size": "187" },
                      { "name": "mbbOutputLimitation.h", "color": "#bcbddc", "size": "146" },
                      { "name": "mbbSanityMonitor.cpp", "color": "#bcbddc", "size": "211" },
                      { "name": "mbbSanityMonitor.h", "color": "#bcbddc", "size": "171" },
                      { "name": "mbbScaleBehaviour.cpp", "color": "#bcbddc", "size": "242" },
                      { "name": "mbbScaleBehaviour.h", "color": "#bcbddc", "size": "176" },
                      { "name": "mbbSplitInput.cpp   ", "color": "#bcbddc", "size": "139" },
                      { "name": "mbbSplitInput.h", "color": "#bcbddc", "size": "134" },
                      { "name": "mbbStaticActivationBehaviour.cpp", "color": "#bcbddc", "size": "218" },
                      { "name": "pluginBehaviourLabels.cpp", "color": "#bcbddc", "size": "41" },
                      { "name": "pluginBehaviourLabels.h", "color": "#bcbddc", "size": "46" },
                      { "name": "pluginBehaviourSignals.cpp", "color": "#bcbddc", "size": "478" },
                      { "name": "pluginBehaviourSignals.h", "color": "#bcbddc", "size": "160" },
                      { "name": "pluginBehaviourWidget.cpp", "color": "#bcbddc", "size": "119" },
                      { "name": "pluginBehaviourWidget.h", "color": "#bcbddc", "size": "45" },
                      { "name": "tBehaviourBasedGroup.cpp", "color": "#bcbddc", "size": "742" },
                      { "name": "tBehaviourBasedGroup.h", "color": "#bcbddc", "size": "284" },
                      { "name": "tBehaviourBasedModule.cpp", "color": "#bcbddc", "size": "1057" },
                      { "name": "tBehaviourBasedModule.h", "color": "#bcbddc", "size": "539" },
                      { "name": "tBehaviourBasis.cpp", "color": "#bcbddc", "size": "512" },
                      { "name": "tBehaviourBasis.h", "color": "#bcbddc", "size": "303" },
                      { "name": "tBehaviourDefinitions.h", "color": "#bcbddc", "size": "123" },
                      { "name": "tBehaviourInfo.cpp", "color": "#bcbddc", "size": "89" },
                      { "name": "tBehaviourInfo.h", "color": "#bcbddc", "size": "113" },
                      { "name": "tBehBBHandler.cpp", "color": "#bcbddc", "size": "912" },
                      { "name": "tBehBBHandler.h", "color": "#bcbddc", "size": "159" },
                      { "name": "tCondition.cpp", "color": "#bcbddc", "size": "120" },
                      { "name": "tCondition.h", "color": "#bcbddc", "size": "210" },
                      { "name": "tPlotSigmoid.cpp", "color": "#bcbddc", "size": "121" },
                      { "name": "tSigmoid.cpp", "color": "#bcbddc", "size": "217" },
                      { "name": "tSigmoid.h", "color": "#bcbddc", "size": "100" }
                   ]
               },
               {
                   "name": "behaviours_for_vehicles", "color": "#9e9ac8",
                   "children": [
                      { "name": "gBasicDifferentialDriveBehaviours.h", "color": "#bcbddc", "size": "159" },
                      { "name": "gbbBasicDifferentialDriveBehaviours.cpp", "color": "#bcbddc", "size": "267" },
                      { "name": "gbbBasicDifferentialDriveBehaviours.h", "color": "#bcbddc", "size": "192" },
                      { "name": "gbbTestGroup.cpp", "color": "#bcbddc", "size": "111" },
                      { "name": "gbbTestGroup.h", "color": "#bcbddc", "size": "117" },
                      { "name": "gTestGroup.cpp", "color": "#bcbddc", "size": "212" },
                      { "name": "gTestGroup.h", "color": "#bcbddc", "size": "147" },
                      { "name": "mbbAntiCollisionTestModule.h", "color": "#bcbddc", "size": "206" },
                      { "name": "mbbAntiCollisionTestModule.hpp", "color": "#bcbddc", "size": "233" },
                      { "name": "mbbAntiCollisionUsingCartesianSectorMap.h", "color": "#bcbddc", "size": "219" },
                      { "name": "mbbAntiCollisionUsingCartesianSectorMap.hpp", "color": "#bcbddc", "size": "421" },
                      { "name": "mbbAntiCollisionUsingPolarSectorMap.h", "color": "#bcbddc", "size": "207" },
                      { "name": "mbbAntiCollisionUsingPolarSectorMap.hpp", "color": "#bcbddc", "size": "357" },
                      { "name": "mbbBasicDriveBehaviour.cpp", "color": "#bcbddc", "size": "198" },
                      { "name": "mbbBasicDriveBehaviour.h", "color": "#bcbddc", "size": "162" },
                      { "name": "mbbControlsizeToActivation.cpp", "color": "#bcbddc", "size": "179" },
                      { "name": "mbbControlsizeToActivation.h", "color": "#bcbddc", "size": "143" },
                      { "name": "mbbDifferentialDriveWheelVelocityCalculation.cpp", "color": "#bcbddc", "size": "203" },
                      { "name": "mbbDifferentialDriveWheelVelocityCalculation.h", "color": "#bcbddc", "size": "166" },
                      { "name": "mbbEmergencyStop.cpp", "color": "#bcbddc", "size": "220" },
                      { "name": "mbbEmergencyStop.h", "color": "#bcbddc", "size": "177" },
                      { "name": "mbbEvasion.cpp", "color": "#bcbddc", "size": "269" },
                      { "name": "mbbEvasion.h", "color": "#bcbddc", "size": "226" },
                      { "name": "mbbEvasionUsingCartesianSectorMap.h", "color": "#bcbddc", "size": "209" },
                      { "name": "mbbEvasionUsingcartesianSectorMap.hpp", "color": "#bcbddc", "size": "409" },
                      { "name": "mbbEvasionUsingPolarSectorMap.h", "color": "#bcbddc", "size": "204" },
                      { "name": "mbbEvasionUsingPolarSectorMap.hpp", "color": "#bcbddc", "size": "383" },
                      { "name": "mbbKeepDistance.cpp", "color": "#bcbddc", "size": "150" },
                      { "name": "mbbKeepDistance.h", "color": "#bcbddc", "size": "145" },
                      { "name": "mbbKeepDistanceRotUsingPolarSectorMap.h", "color": "#bcbddc", "size": "214" },
                      { "name": "mbbKeepDistanceRotUsingPolarSectorMap.hpp", "color": "#bcbddc", "size": "335" },
                      { "name": "mbbSlowDown.cpp", "color": "#bcbddc", "size": "220" },
                      { "name": "mbbSlowDown.h", "color": "#bcbddc", "size": "217" },
                      { "name": "mbbTestModule.cpp", "color": "#bcbddc", "size": "251" },
                      { "name": "mbbTestModule.h", "color": "#bcbddc", "size": "193" },
                      { "name": "pTestPart.cpp", "color": "#bcbddc", "size": "97" },
                      { "name": "sPointAccessUtils.cpp", "color": "#bcbddc", "size": "92" },
                      { "name": "sPointAccessUtils.h", "color": "#bcbddc", "size": "66" },
                      { "name": "tAntiCollision.h", "color": "#bcbddc", "size": "222" },
                      { "name": "tAntiCollision.hpp", "color": "#bcbddc", "size": "248" },
                      { "name": "tEvasion.h", "color": "#bcbddc", "size": "213" },
                      { "name": "tEvasion.hpp", "color": "#bcbddc", "size": "261" },
                      { "name": "tKeepDistance.h", "color": "#bcbddc", "size": "234" },
                      { "name": "tKeepDistance.hpp", "color": "#bcbddc", "size": "247" },
                      { "name": "tKeepDistanceRot.h", "color": "#bcbddc", "size": "206" },
                      { "name": "tKeepDistanceRot.hpp", "color": "#bcbddc", "size": "248" },
                      { "name": "tKeepDistanceSideward.h", "color": "#bcbddc", "size": "209" },
                      { "name": "tKeepDistanceSideward.hpp", "color": "#bcbddc", "size": "239" },
                      { "name": "tSafetyBehaviour.h", "color": "#bcbddc", "size": "307" },
                      { "name": "tSafetyBehaviour.hpp", "color": "#bcbddc", "size": "395" },
                      { "name": "tSectorBBBehaviour.cpp", "color": "#bcbddc", "size": "324" }
                   ]
               },
               {
                   "name": "fileio", "color": "#9e9ac8",
                   "children": [
                      { "name": "mFiIeList.cpp", "color": "#bcbddc", "size": "158" },
                      { "name": "mFiIeList.h", "color": "#bcbddc", "size": "151" },
                      { "name": "mLogFile.cpp", "color": "#bcbddc", "size": "323" },
                      { "name": "mLogFile.h", "color": "#bcbddc", "size": "193" },
                      { "name": "mReadCycleFromFile.cpp", "color": "#bcbddc", "size": "221" },
                      { "name": "mReadCycleFromFile.h", "color": "#bcbddc", "size": "163" },
                      { "name": "mReadCycleFromFileSync.cpp", "color": "#bcbddc", "size": "319" },
                      { "name": "mReadFromFiIe.cpp", "color": "#bcbddc", "size": "218" },
                      { "name": "mReadFromFiIe.h", "color": "#bcbddc", "size": "162" },
                      { "name": "mSensorMonitor.h", "color": "#bcbddc", "size": "274" },
                      { "name": "tFileSearch.cpp", "color": "#bcbddc", "size": "183" },
                      { "name": "tFileSearch.h", "color": "#bcbddc", "size": "171" },
                      { "name": "tLogWriteStream.h", "color": "#bcbddc", "size": "192" },
                      { "name": "tMD5.cpp", "color": "#bcbddc", "size": "487" },
                      { "name": "tMD5.h", "color": "#bcbddc", "size": "187" },
                      { "name": "tXMLDocument.cpp", "color": "#bcbddc", "size": "436" },
                      { "name": "tXMLDocument.h", "color": "#bcbddc", "size": "214" },
                      { "name": "tXMLNode.cpp", "color": "#bcbddc", "size": "264" },
                      { "name": "tXMLNode.h", "color": "#bcbddc", "size": "222" },
                      { "name": "XMLHelper.cpp", "color": "#bcbddc", "size": "75" },
                      { "name": "XMLHelper.h", "color": "#bcbddc", "size": "55" },
                      { "name": "lmportExportSymbols.h", "color": "#bcbddc", "size": "55" },
                      { "name": "mExecuteExternalCommands.cpp", "color": "#bcbddc", "size": "130" },
                      { "name": "mExecuteExternalCommands.h", "color": "#bcbddc", "size": "115" },
                      { "name": "mLogStreamCollector.cpp", "color": "#bcbddc", "size": "278" },
                      { "name": "mLogStreamCollector.h", "color": "#bcbddc", "size": "157" },
                      { "name": "mReadCycleFromFileSync.h", "color": "#bcbddc", "size": "166" },
                      { "name": "mSensorMonitor.cpp", "color": "#bcbddc", "size": "337" },
                      { "name": "mSwitchablesensorMonitor.cpp", "color": "#bcbddc", "size": "314" },
                      { "name": "mSwitchableSensorMonitor.h", "color": "#bcbddc", "size": "245" },
                      { "name": "tBlackboardLogStream.cpp", "color": "#bcbddc", "size": "35" },
                      { "name": "tBlackboardLogStream.h", "color": "#bcbddc", "size": "131" },
                      { "name": "tDisplayLogStreams.cpp", "color": "#bcbddc", "size": "360" },
                      { "name": "tDisplayLogStreams.h", "color": "#bcbddc", "size": "139" },
                      { "name": "tLogReadStream.cpp", "color": "#bcbddc", "size": "234" },
                      { "name": "tLogReadStream.h", "color": "#bcbddc", "size": "129" },
                      { "name": "tLogWriteStream.cpp", "color": "#bcbddc", "size": "410" },
                      { "name": "tSaveState.cpp", "color": "#bcbddc", "size": "149" },
                      { "name": "tSaveState.h", "color": "#bcbddc", "size": "75" }
                   ]
               },
               {
                   "name": "general_ext", "color": "#9e9ac8",
                   "children": [
                      { "name": "gTestGeometryBlackboard.cpp", "color": "#bcbddc", "size": "86" },
                      { "name": "gTestGeometryBlackboard.h", "color": "#bcbddc", "size": "112" },
                      { "name": "iowarrior.h", "color": "#bcbddc", "size": "88" },
                      { "name": "joystick_2.4.17.h", "color": "#bcbddc", "size": "130" },
                      { "name": "mAbsolutesize.cpp", "color": "#bcbddc", "size": "87" },
                      { "name": "mAbsolutesize.h", "color": "#bcbddc", "size": "131" },
                      { "name": "mBlackboardMonitor.cpp", "color": "#bcbddc", "size": "190" },
                      { "name": "mBlackboardMonitor.h", "color": "#bcbddc", "size": "143" },
                      { "name": "mButtonDemux.cpp", "color": "#bcbddc", "size": "205" },
                      { "name": "mButtonDemux.h", "color": "#bcbddc", "size": "152" },
                      { "name": "mChangeRequestConnector.cpp", "color": "#bcbddc", "size": "106" },
                      { "name": "mChangeRequestConnector.h", "color": "#bcbddc", "size": "121" },
                      { "name": "mConfigModule.cpp", "color": "#bcbddc", "size": "171" },
                      { "name": "mConfigModule.h", "color": "#bcbddc", "size": "109" },
                      { "name": "mCounter.cpp", "color": "#bcbddc", "size": "120" },
                      { "name": "mCounter.h", "color": "#bcbddc", "size": "139" },
                      { "name": "mDrawRotatingCross.cpp", "color": "#bcbddc", "size": "173" },
                      { "name": "mDrawRotatingCross.h", "color": "#bcbddc", "size": "163" },
                      { "name": "mGeometryBBCollector.cpp", "color": "#bcbddc", "size": "216" },
                      { "name": "mGeometryBBCollector.h", "color": "#bcbddc", "size": "154" },
                      { "name": "mGeometryBlackboardHandler.cpp", "color": "#bcbddc", "size": "163" },
                      { "name": "mGeometryBlackboardHandler.h", "color": "#bcbddc", "size": "181" },
                      { "name": "mGetLoopTime.cpp", "color": "#bcbddc", "size": "268" },
                      { "name": "mGetLoopTime.h", "color": "#bcbddc", "size": "156" },
                      { "name": "mInterpolateSensorData.cpp", "color": "#bcbddc", "size": "157" },
                      { "name": "mJoystick.cpp", "color": "#bcbddc", "size": "618" },
                      { "name": "mJoystick.h", "color": "#bcbddc", "size": "247" },
                      { "name": "mlnterpolateSensorData.h", "color": "#bcbddc", "size": "143" },
                      { "name": "mNot.cpp", "color": "#bcbddc", "size": "70" },
                      { "name": "mNot.h", "color": "#bcbddc", "size": "85" },
                      { "name": "mRecordAndPlay.cpp", "color": "#bcbddc", "size": "552" },
                      { "name": "mRecordAndPlay.h", "color": "#bcbddc", "size": "238" },
                      { "name": "mSignum.cpp", "color": "#bcbddc", "size": "147" },
                      { "name": "mSignum.h", "color": "#bcbddc", "size": "173" },
                      { "name": "mSimpleRecorder.cpp", "color": "#bcbddc", "size": "392" },
                      { "name": "mSimpleRecorder.h", "color": "#bcbddc", "size": "161" },
                      { "name": "mTimer.cpp", "color": "#bcbddc", "size": "250" },
                      { "name": "mTimer.h", "color": "#bcbddc", "size": "220" },
                      { "name": "mToSystemTime.cpp", "color": "#bcbddc", "size": "143" },
                      { "name": "mToSystemTime.h", "color": "#bcbddc", "size": "139" },
                      { "name": "mTriggeredAndDelayedPasschildren.cpp", "color": "#bcbddc", "size": "203" },
                      { "name": "mTriggeredAndDelayedPasschildren.h", "color": "#bcbddc", "size": "137" },
                      { "name": "mVisualizeDistanceSensor.cpp", "color": "#bcbddc", "size": "238" },
                      { "name": "mVisualizeDistanceSensor.h", "color": "#bcbddc", "size": "183" },
                      { "name": "pluginbrowserFloatBlackboard.cpp", "color": "#bcbddc", "size": "276" },
                      { "name": "pluginbrowserFloatBlackboard.h", "color": "#bcbddc", "size": "105" },
                      { "name": "pluginguiFileSelector.cpp", "color": "#bcbddc", "size": "440" },
                      { "name": "pluginguiFileSelector.h", "color": "#bcbddc", "size": "172" },
                      { "name": "pluginguiListView.cpp", "color": "#bcbddc", "size": "445" },
                      { "name": "pluginguiListView.h", "color": "#bcbddc", "size": "173" },
                      { "name": "pluginguisizePlotter.cpp", "color": "#bcbddc", "size": "2061" },
                      { "name": "pluginguisizePlotter.h", "color": "#bcbddc", "size": "366" },
                      { "name": "pTestGeometryBlackboard.cpp", "color": "#bcbddc", "size": "92" },
                      { "name": "sBlackboardUtils.cpp", "color": "#bcbddc", "size": "61" },
                      { "name": "sBlackboardUtils.h", "color": "#bcbddc", "size": "63" },
                      { "name": "sGeometryBlackboardUtils.cpp", "color": "#bcbddc", "size": "97" },
                      { "name": "sGeometryBlackboardUtils.h", "color": "#bcbddc", "size": "75" },
                      { "name": "tConfigurable.cpp", "color": "#bcbddc", "size": "65" },
                      { "name": "tConfigurable.h", "color": "#bcbddc", "size": "57" },
                      { "name": "tConfiguration.cpp", "color": "#bcbddc", "size": "92" },
                      { "name": "tConfiguration.h", "color": "#bcbddc", "size": "174" },
                      { "name": "tFileSelectionEvaluator.cpp", "color": "#bcbddc", "size": "292" },
                      { "name": "tFileSelectionEvaluator.h", "color": "#bcbddc", "size": "117" },
                      { "name": "tFloatRingBuffer.cpp", "color": "#bcbddc", "size": "136" },
                      { "name": "tFloatRingBuffer.h", "color": "#bcbddc", "size": "89" },
                      { "name": "tIOWarrior.cpp", "color": "#bcbddc", "size": "797" },
                      { "name": "tIOWarrior.h", "color": "#bcbddc", "size": "260" },
                      { "name": "tStringBlackboardHandler.cpp", "color": "#bcbddc", "size": "622" },
                      { "name": "tStringBlackboardHandler.h", "color": "#bcbddc", "size": "160" },
                      { "name": "tTimer.cpp", "color": "#bcbddc", "size": "143" },
                      { "name": "tTimer.h", "color": "#bcbddc", "size": "101" },
                      { "name": "tTransformTime.cpp", "color": "#bcbddc", "size": "69" },
                      { "name": "tTransformTime.h", "color": "#bcbddc", "size": "49" },
                      { "name": "tUdpReceiver.cpp", "color": "#bcbddc", "size": "184" },
                      { "name": "tUdpReceiver.h", "color": "#bcbddc", "size": "64" },
                      { "name": "tUdpSender.cpp", "color": "#bcbddc", "size": "86" },
                      { "name": "tUdpSender.h", "color": "#bcbddc", "size": "52" }
                   ]
               },
               {
                   "name": "hazard_detection", "color": "#9e9ac8",
                   "children": [
                      { "name": "tAlgorithm.h", "color": "#bcbddc", "size": "112" },
                      {
                          "name": "aqua_vision", "color": "#bcbddc",
                          "children": [
                             { "name": "gAquavision.h", "color": "#dadaeb", "size": "182" },
                             { "name": "gAquavision.hpp", "color": "#dadaeb", "size": "447" },
                             { "name": "mCalcDiffs.cpp", "color": "#dadaeb", "size": "643" },
                             { "name": "mCalcDiffs.h", "color": "#dadaeb", "size": "238" },
                             { "name": "mColorCorrection.cpp", "color": "#dadaeb", "size": "275" },
                             { "name": "mColorCorrection.h", "color": "#dadaeb", "size": "154" }
                          ]
                      },
                      {
                          "name": "fusion", "color": "#bcbddc",
                          "children": [
                             { "name": "mAbstractSensorFusion.h", "color": "#dadaeb", "size": "282" },
                             { "name": "mAbstractSensorFusion.hpp", "color": "#dadaeb", "size": "306" },
                             { "name": "mFusionMapExporter.h", "color": "#dadaeb", "size": "160" },
                             { "name": "mFusionMapExporter.hpp", "color": "#dadaeb", "size": "274" },
                             { "name": "mToPathPlannerGridMap.h", "color": "#dadaeb", "size": "333" },
                             { "name": "mToPathPlannerGridMap.hpp", "color": "#dadaeb", "size": "343" },
                             { "name": "tAbstractSensorFusionDefinitions.h", "color": "#dadaeb", "size": "80" },
                             { "name": "tAbstractSensorFusionGridMapBaseDefinitions.h", "color": "#dadaeb", "size": "83" },
                             { "name": "tAbstractSensorFusionGridMapDefinitions.h", "color": "#dadaeb", "size": "126" }
                          ]
                      },
                      {
                          "name": "laser_3d", "color": "#bcbddc",
                          "children": [
                             { "name": "m3DScanEvaluator.hpp", "color": "#dadaeb", "size": "1053" },
                             { "name": "mScanvisualiser.h", "color": "#dadaeb", "size": "203" },
                             { "name": "t3DScanEvaluatorEnums.h", "color": "#dadaeb", "size": "62" },
                             { "name": "gDisplayScanLine.hpp", "color": "#dadaeb", "size": "123" },
                             { "name": "m3DScanEvaluator.h", "color": "#dadaeb", "size": "366" },
                             { "name": "mDisplayScanLine.h", "color": "#dadaeb", "size": "173" },
                             { "name": "mDisplayScanLine.hpp", "color": "#dadaeb", "size": "184" },
                             { "name": "mScanVisualiser.cpp", "color": "#dadaeb", "size": "636" },
                             { "name": "mVegetationDiscriminationLaser3D.cpp", "color": "#dadaeb", "size": "447" },
                             { "name": "mVegetationDiscriminationLaser3D.h", "color": "#dadaeb", "size": "207" },
                             { "name": "mWaterDetector.h", "color": "#dadaeb", "size": "204" },
                             { "name": "mWaterDetector.hpp", "color": "#dadaeb", "size": "423" },
                             { "name": "ScanListUtils.cpp", "color": "#dadaeb", "size": "122" },
                             { "name": "ScanListUtils.h", "color": "#dadaeb", "size": "190" },
                             { "name": "t3DLaserScannerParams.cpp", "color": "#dadaeb", "size": "280" },
                             { "name": "t3DLaserScannerParams.h", "color": "#dadaeb", "size": "59" },
                             { "name": "tBoundingBox.h", "color": "#dadaeb", "size": "71" },
                             { "name": "tScanList.cpp", "color": "#dadaeb", "size": "77" },
                             { "name": "tScanList.h", "color": "#dadaeb", "size": "349" },
                             { "name": "tSinglescanEvaluator.cpp", "color": "#dadaeb", "size": "1729" },
                             { "name": "tSinglescanEvaluator.h", "color": "#dadaeb", "size": "179" },
                             { "name": "tVegetationDiscriminationLaser3D.cpp", "color": "#dadaeb", "size": "177" },
                             { "name": "tVegetationDiscriminationLaser3D.h", "color": "#dadaeb", "size": "327" },
                             { "name": "tVegetationDiscriminationLaser3DDefinitions.h", "color": "#dadaeb", "size": "88" }
                          ]
                      }
                   ]
               },
               {
                   "name": "kernel", "color": "#9e9ac8",
                   "children": [
                      { "name": "BlackboardContentType.h", "color": "#bcbddc", "size": "222" },
                      { "name": "BlackboardDefinitions.h", "color": "#bcbddc", "size": "178" },
                      { "name": "ByteSwap.h", "color": "#bcbddc", "size": "62" },
                      { "name": "CoreExtension.h", "color": "#bcbddc", "size": "92" },
                      { "name": "cyg_getopt.h", "color": "#bcbddc", "size": "80" },
                      { "name": "Debugdefs.cpp", "color": "#bcbddc", "size": "33" },
                      { "name": "Debugdefs.h", "color": "#bcbddc", "size": "196" },
                      { "name": "Descr.cpp", "color": "#bcbddc", "size": "63" },
                      { "name": "Descr.h", "color": "#bcbddc", "size": "62" },
                      { "name": "ImportExportSymboIs.h", "color": "#bcbddc", "size": "47" },
                      { "name": "KernelMath.h", "color": "#bcbddc", "size": "308" },
                      { "name": "ListTypes.h", "color": "#bcbddc", "size": "58" },
                      { "name": "LocalDebug.h", "color": "#bcbddc", "size": "87" },
                      { "name": "Main.h", "color": "#bcbddc", "size": "688" },
                      { "name": "mca_lxrt_extension.h", "color": "#bcbddc", "size": "79" },
                      { "name": "MCA2Plugin.h", "color": "#bcbddc", "size": "35" },
                      { "name": "MCACommunication.h", "color": "#bcbddc", "size": "235" },
                      { "name": "MCAlxrt.cpp", "color": "#bcbddc", "size": "144" },
                      { "name": "MCAlxrt.h", "color": "#bcbddc", "size": "100" },
                      { "name": "ModuleDebug.h", "color": "#bcbddc", "size": "58" },
                      { "name": "Parameter.cpp", "color": "#bcbddc", "size": "65" },
                      { "name": "Parameter.h", "color": "#bcbddc", "size": "528" },
                      { "name": "sBlackboardUtils.h", "color": "#bcbddc", "size": "85" },
                      { "name": "sCompileTimeAssertion.h", "color": "#bcbddc", "size": "103" },
                      { "name": "standaloneHandler.cpp", "color": "#bcbddc", "size": "38" },
                      { "name": "tAsynclnterface.cpp", "color": "#bcbddc", "size": "88" },
                      { "name": "tAsynclnterface.h", "color": "#bcbddc", "size": "77" },
                      { "name": "tAttributesStruct.h", "color": "#bcbddc", "size": "504" },
                      { "name": "tAttributeTree.cpp", "color": "#bcbddc", "size": "1137" },
                      { "name": "tAttributeTree.h", "color": "#bcbddc", "size": "466" },
                      { "name": "tBlackboard.cpp", "color": "#bcbddc", "size": "510" },
                      { "name": "tBlackboard.h", "color": "#bcbddc", "size": "557" },
                      { "name": "tBlackboardContents.h", "color": "#bcbddc", "size": "488" },
                      { "name": "tBlackboardCopy.cpp", "color": "#bcbddc", "size": "663" },
                      { "name": "tBlackboardCopy.h", "color": "#bcbddc", "size": "415" },
                      { "name": "tBlackboardGuard.cpp", "color": "#bcbddc", "size": "59" },
                      { "name": "tBlackboardGuard.h", "color": "#bcbddc", "size": "90" },
                      { "name": "tBlackboardHandler.cpp", "color": "#bcbddc", "size": "959" },
                      { "name": "tBlackboardHandler.h", "color": "#bcbddc", "size": "350" },
                      { "name": "tBlackboardInfo.h", "color": "#bcbddc", "size": "461" },
                      { "name": "tBlackboardT.h", "color": "#bcbddc", "size": "83" },
                      { "name": "tCacheBlackboardCreator.h", "color": "#bcbddc", "size": "68" },
                      { "name": "tCacheBlackboardHandler.cpp", "color": "#bcbddc", "size": "94" },
                      { "name": "tCacheBlackboardHandler.h", "color": "#bcbddc", "size": "73" },
                      { "name": "tCheckSum.cpp", "color": "#bcbddc", "size": "74" },
                      { "name": "tCheckSum.h", "color": "#bcbddc", "size": "205" },
                      { "name": "tClient.cpp", "color": "#bcbddc", "size": "59" },
                      { "name": "tClient.h", "color": "#bcbddc", "size": "84" },
                      { "name": "tCommunicationStream.cpp", "color": "#bcbddc", "size": "193" },
                      { "name": "tCommunicationStream.h", "color": "#bcbddc", "size": "524" },
                      { "name": "tEdge.cpp", "color": "#bcbddc", "size": "394" },
                      { "name": "tEdge.h", "color": "#bcbddc", "size": "296" },
                      { "name": "tFiIePath.cpp", "color": "#bcbddc", "size": "379" },
                      { "name": "tFiIePath.h", "color": "#bcbddc", "size": "242" },
                      { "name": "tGetopt.cpp", "color": "#bcbddc", "size": "362" },
                      { "name": "tGetopt.h", "color": "#bcbddc", "size": "240" },
                      { "name": "tGroup.cpp", "color": "#bcbddc", "size": "2304" },
                      { "name": "tGroup.h", "color": "#bcbddc", "size": "669" },
                      { "name": "tHandler.cpp", "color": "#bcbddc", "size": "883" },
                      { "name": "tHandler.h", "color": "#bcbddc", "size": "187" },
                      { "name": "tIdentification.h", "color": "#bcbddc", "size": "333" },
                      { "name": "Timedebug.h", "color": "#bcbddc", "size": "55" },
                      { "name": "tInterPartEdge.cpp", "color": "#bcbddc", "size": "132" },
                      { "name": "tInterPartEdge.h", "color": "#bcbddc", "size": "118" },
                      { "name": "tIOVector.cpp", "color": "#bcbddc", "size": "161" },
                      { "name": "tIOVector.h", "color": "#bcbddc", "size": "232" },
                      { "name": "tListT.h", "color": "#bcbddc", "size": "325" },
                      { "name": "tModuIe.h", "color": "#bcbddc", "size": "2938" },
                      { "name": "tModule.cpp", "color": "#bcbddc", "size": "1594" },
                      { "name": "tMutex.cpp", "color": "#bcbddc", "size": "203" },
                      { "name": "tMutex.h", "color": "#bcbddc", "size": "105" },
                      { "name": "tNestedRemoteModule.h", "color": "#bcbddc", "size": "94" },
                      { "name": "tParaIlelGroup.h", "color": "#bcbddc", "size": "72" },
                      { "name": "tParallelGroup.cpp", "color": "#bcbddc", "size": "353" },
                      { "name": "tParent.cpp", "color": "#bcbddc", "size": "108" },
                      { "name": "tParent.h", "color": "#bcbddc", "size": "156" },
                      { "name": "tParser.cpp", "color": "#bcbddc", "size": "206" },
                      { "name": "tParser.h", "color": "#bcbddc", "size": "95" },
                      { "name": "tPart.cpp", "color": "#bcbddc", "size": "4399" },
                      { "name": "tPart.h", "color": "#bcbddc", "size": "1372" },
                      { "name": "tPartContainer.cpp", "color": "#bcbddc", "size": "319" },
                      { "name": "tPartContainer.h", "color": "#bcbddc", "size": "121" },
                      { "name": "tPartDescription.h", "color": "#bcbddc", "size": "91" },
                      { "name": "tPartParameter.h", "color": "#bcbddc", "size": "85" },
                      { "name": "tPartReg.h", "color": "#bcbddc", "size": "77" },
                      { "name": "tPluginT.h", "color": "#bcbddc", "size": "306" },
                      { "name": "tRWLock.cpp", "color": "#bcbddc", "size": "295" },
                      { "name": "tRWLock.h", "color": "#bcbddc", "size": "120" },
                      { "name": "tServer.cpp", "color": "#bcbddc", "size": "198" },
                      { "name": "tServer.h", "color": "#bcbddc", "size": "133" },
                      { "name": "tStandardCreateModuleAction.h", "color": "#bcbddc", "size": "83" },
                      { "name": "tTCPClient.cpp", "color": "#bcbddc", "size": "334" },
                      { "name": "tTCPClient.h", "color": "#bcbddc", "size": "125" },
                      { "name": "tTCPConnection.cpp", "color": "#bcbddc", "size": "1077" },
                      { "name": "tTCPConnection.h", "color": "#bcbddc", "size": "158" },
                      { "name": "tTCPPort.h", "color": "#bcbddc", "size": "108" },
                      { "name": "tTCPServer.cpp", "color": "#bcbddc", "size": "575" },
                      { "name": "tTCPServer.h", "color": "#bcbddc", "size": "194" },
                      { "name": "tTCPSocket.cpp", "color": "#bcbddc", "size": "381" },
                      { "name": "tTCPSocket.h", "color": "#bcbddc", "size": "274" },
                      { "name": "tThread.h", "color": "#bcbddc", "size": "350" },
                      { "name": "tThreadContainer.cpp", "color": "#bcbddc", "size": "662" },
                      { "name": "tThreadContainer.h", "color": "#bcbddc", "size": "343" },
                      { "name": "tThreadRegister.h", "color": "#bcbddc", "size": "52" },
                      { "name": "tTime.cpp", "color": "#bcbddc", "size": "62" },
                      { "name": "tTime.h", "color": "#bcbddc", "size": "50" },
                      { "name": "Typedefs.cpp", "color": "#bcbddc", "size": "37" },
                      { "name": "Typedefs.h", "color": "#bcbddc", "size": "85" },
                      { "name": "win_crypt.h", "color": "#bcbddc", "size": "87" },
                      { "name": "win_cryptprivate.h", "color": "#bcbddc", "size": "71" },
                      { "name": "win_ufccrypt.h", "color": "#bcbddc", "size": "50" },
                      { "name": "WindowsUnixCompat.h", "color": "#bcbddc", "size": "116" }
                   ]
               },
               {
                   "name": "laser_scanner", "color": "#9e9ac8",
                   "children": [
                      { "name": "gLaserScanner.h", "color": "#bcbddc", "size": "187" },
                      { "name": "gLaserScanner.hpp", "color": "#bcbddc", "size": "187" },
                      { "name": "gLaserScannerlnterface.h", "color": "#bcbddc", "size": "77" },
                      { "name": "gLaserScanPlayer.cpp", "color": "#bcbddc", "size": "164" },
                      { "name": "gLaserScanPlayer.h", "color": "#bcbddc", "size": "128" },
                      { "name": "gLaserscanRecorder.cpp", "color": "#bcbddc", "size": "182" },
                      { "name": "gLaserscanRecorder.h", "color": "#bcbddc", "size": "123" },
                      { "name": "gTestLaserScanner.cpp", "color": "#bcbddc", "size": "243" },
                      { "name": "gTestLaserScanner.h", "color": "#bcbddc", "size": "127" },
                      { "name": "mActuatedLaserScanner.h", "color": "#bcbddc", "size": "164" },
                      { "name": "mActuatedLaserScanner.hpp", "color": "#bcbddc", "size": "311" },
                      { "name": "mDisplayScannerData.cpp", "color": "#bcbddc", "size": "522" },
                      { "name": "mDisplayScannerData.h", "color": "#bcbddc", "size": "297" },
                      { "name": "mLaserScanner.cpp", "color": "#bcbddc", "size": "811" },
                      { "name": "mLaserScanner.h", "color": "#bcbddc", "size": "327" },
                      { "name": "mLaserScanPlayer.cpp", "color": "#bcbddc", "size": "647" },
                      { "name": "mLaserScanPlayer.h", "color": "#bcbddc", "size": "218" },
                      { "name": "mLaserscanRecorder.cpp", "color": "#bcbddc", "size": "633" },
                      { "name": "mLaserscanRecorder.h", "color": "#bcbddc", "size": "300" },
                      { "name": "mLaserTilterSimuIator.cpp", "color": "#bcbddc", "size": "274" },
                      { "name": "mLaserTilterSimulator.h", "color": "#bcbddc", "size": "175" },
                      { "name": "mSimulateDistanceSensorCoin.cpp", "color": "#bcbddc", "size": "219" },
                      { "name": "mSimulateDistanceSensorCoin.h", "color": "#bcbddc", "size": "169" },
                      { "name": "mTestSimpleUrg.cpp", "color": "#bcbddc", "size": "198" },
                      { "name": "mTestSimpleUrg.h", "color": "#bcbddc", "size": "137" },
                      { "name": "mUrgScannerSimple.cpp", "color": "#bcbddc", "size": "298" },
                      { "name": "mUrgScannerSimple.h", "color": "#bcbddc", "size": "155" },
                      { "name": "pLaserScanPlayer.cpp", "color": "#bcbddc", "size": "142" },
                      { "name": "pLaserScanRecorder.cpp", "color": "#bcbddc", "size": "102" },
                      { "name": "pTestLaserScanner.cpp", "color": "#bcbddc", "size": "95" },
                      { "name": "pTestS3000.cpp", "color": "#bcbddc", "size": "93" },
                      { "name": "pTestSimpIeUrg.cpp", "color": "#bcbddc", "size": "99" },
                      { "name": "sLaserScannerFactory.cpp", "color": "#bcbddc", "size": "129" },
                      { "name": "sLaserScannerFactory.h", "color": "#bcbddc", "size": "49" },
                      { "name": "tDistanceDataBlackboardInformationExample.h", "color": "#bcbddc", "size": "74" },
                      { "name": "test_laser_scanner.cpp", "color": "#bcbddc", "size": "102" },
                      { "name": "tLaserScannerInfo.h", "color": "#bcbddc", "size": "241" },
                      { "name": "tLaserScannerInfoUtils.h", "color": "#bcbddc", "size": "184" },
                      { "name": "tLaserScannerSimulator.cpp", "color": "#bcbddc", "size": "116" },
                      { "name": "tLaserScannerSimulator.h", "color": "#bcbddc", "size": "86" },
                      { "name": "tLaserScannerSimulator2D.h", "color": "#bcbddc", "size": "86" },
                      { "name": "tLmsloOScanDataConfigRRLab.cpp", "color": "#bcbddc", "size": "112" },
                      { "name": "tLmslooScanDataConfigRRLab.h", "color": "#bcbddc", "size": "95" },
                      { "name": "tLmslooSopasInterfaceRRLab.cpp", "color": "#bcbddc", "size": "91" },
                      { "name": "tLmslooSopasInterfaceRRLab.h", "color": "#bcbddc", "size": "101" },
                      { "name": "tSickLMS1XX.cpp", "color": "#bcbddc", "size": "228" },
                      { "name": "tSickLMS1XX.h", "color": "#bcbddc", "size": "209" },
                      { "name": "tSickSopasScannerInterface.h", "color": "#bcbddc", "size": "72" },
                      { "name": "tUrgScannerSimple.cpp", "color": "#bcbddc", "size": "276" },
                      { "name": "tUrgScannerSimple.h", "color": "#bcbddc", "size": "94" }
                   ]
               },
               {
                   "name": "sensor_data_representation", "color": "#9e9ac8",
                   "children": [
                      {
                          "name": "contents", "color": "#bcbddc",
                          "children": [
                             {
                                 "name": "obstacles", "color": "#dadaeb",
                                 "children": [
                                    { "name": "tObstacle.cpp", "color": "#dadaeb", "size": "121" },
                                    { "name": "tObstacle.h", "color": "#dadaeb", "size": "152" },
                                    { "name": "tObstacleCartesian2D.cpp", "color": "#dadaeb", "size": "91" },
                                    { "name": "tObstacleCartesian2D.h", "color": "#dadaeb", "size": "125" },
                                    { "name": "tObstacleCartesian3D.cpp", "color": "#dadaeb", "size": "85" },
                                    { "name": "tObstacleCartesian3D.h", "color": "#dadaeb", "size": "113" },
                                    { "name": "tObstacleCylindricaI.h", "color": "#dadaeb", "size": "113" },
                                    { "name": "tObstacleCylindrical.cpp", "color": "#dadaeb", "size": "86" },
                                    { "name": "tObstaclePolar.cpp", "color": "#dadaeb", "size": "92" },
                                    { "name": "tObstaclePolar.h", "color": "#dadaeb", "size": "125" },
                                    { "name": "tObstacleSpherical.cpp", "color": "#dadaeb", "size": "86" },
                                    { "name": "tObstacleSpherical.h", "color": "#dadaeb", "size": "115" },
                                    { "name": "tObstacleSurface.cpp", "color": "#dadaeb", "size": "126" },
                                    { "name": "tObstacleSurface.h", "color": "#dadaeb", "size": "136" },
                                    { "name": "tObstacleSurfacePatch.cpp", "color": "#dadaeb", "size": "137" },
                                    { "name": "tObstacleSurfacePatch.h", "color": "#dadaeb", "size": "164" }
                                 ]
                             }
                          ]
                      },
                      {
                          "name": "handlers", "color": "#bcbddc",
                          "children": [
                             { "name": "mGridMapBBHandler.h", "color": "#dadaeb", "size": "299" },
                             { "name": "mGridMapBBHandler.hpp", "color": "#dadaeb", "size": "465" },
                             { "name": "mProbabilisticGridMapBBHandler.h", "color": "#dadaeb", "size": "151" },
                             { "name": "mProbabilisticGridMapBBHandler.hpp", "color": "#dadaeb", "size": "159" },
                             { "name": "mScrollableGridMapBBHandler.h", "color": "#dadaeb", "size": "157" },
                             { "name": "mScrollableGridMapBBHandler.hpp", "color": "#dadaeb", "size": "146" },
                             { "name": "sGridMapBlackboardUtils.h", "color": "#dadaeb", "size": "327" },
                             { "name": "sGridMapUtils.h", "color": "#dadaeb", "size": "146" },
                             { "name": "sSectorUtils.cpp", "color": "#dadaeb", "size": "789" },
                             { "name": "sSectorUtils.h", "color": "#dadaeb", "size": "735" },
                             { "name": "sSectorUtils.hpp", "color": "#dadaeb", "size": "83" },
                             { "name": "tSectorBlackboardInfo.h", "color": "#dadaeb", "size": "101" },
                             { "name": "tSectorMapBBHandIer.h", "color": "#dadaeb", "size": "443" },
                             { "name": "tSectorMapBBHandler.cpp", "color": "#dadaeb", "size": "103" }
                          ]
                      }
                   ]
               },
               {
                   "name": "sim_vis_3d", "color": "#9e9ac8",
                   "children": [
                      { "name": "gCoinSimulation.cpp", "color": "#bcbddc", "size": "201" },
                      { "name": "gCoinSimulation.h", "color": "#bcbddc", "size": "261" },
                      { "name": "mSimulation.cpp", "color": "#bcbddc", "size": "162" },
                      { "name": "mSimulation.h", "color": "#bcbddc", "size": "191" },
                      { "name": "mSimVisBase.cpp", "color": "#bcbddc", "size": "505" },
                      { "name": "mSimVisBase.h", "color": "#bcbddc", "size": "330" },
                      { "name": "msizeBBEdgeMapper.cpp", "color": "#bcbddc", "size": "329" },
                      { "name": "msizeBBEdgeMapper.h", "color": "#bcbddc", "size": "225" },
                      { "name": "mVisualization.cpp", "color": "#bcbddc", "size": "153" },
                      { "name": "mVisualization.h", "color": "#bcbddc", "size": "180" },
                      { "name": "pluginbrowsertCoinDescriptorBlackboard.cpp", "color": "#bcbddc", "size": "226" },
                      { "name": "pluginbrowsertCoinDescriptorBlackboard.h", "color": "#bcbddc", "size": "89" },
                      { "name": "pluginguiCoinSceneViewer.cpp", "color": "#bcbddc", "size": "3662" },
                      { "name": "pluginguiCoinSceneViewer.h", "color": "#bcbddc", "size": "839" },
                      { "name": "tCameraControlDiaIog.h", "color": "#bcbddc", "size": "68" },
                      { "name": "tCameraControlDialog.cpp", "color": "#bcbddc", "size": "266" },
                      { "name": "tCameraSIiderSettingsWidget.h", "color": "#bcbddc", "size": "68" },
                      { "name": "tCoinSceneViewerInterface.cpp", "color": "#bcbddc", "size": "65" },
                      { "name": "tCoinSceneViewerlnterface.h", "color": "#bcbddc", "size": "110" },
                      { "name": "tCoinSceneViewerPlugin.cpp", "color": "#bcbddc", "size": "42" },
                      { "name": "tCoinSceneViewerPlugin.h", "color": "#bcbddc", "size": "79" },
                      { "name": "tCoinSceneViewerPluginBase.cpp", "color": "#bcbddc", "size": "67" },
                      { "name": "tCoinSceneViewerPluginBase.h", "color": "#bcbddc", "size": "109" },
                      { "name": "tDistanceDataVisualizerPlugin.cpp", "color": "#bcbddc", "size": "535" },
                      { "name": "tDistanceDataVisualizerPlugin.h", "color": "#bcbddc", "size": "236" },
                      { "name": "tDistanceSensorControIWidget.h", "color": "#bcbddc", "size": "49" },
                      { "name": "tGeometryTraits.h", "color": "#bcbddc", "size": "126" },
                      { "name": "tImageVisualizerPlugin.cpp", "color": "#bcbddc", "size": "303" },
                      { "name": "tImageVisualizerPlugin.h", "color": "#bcbddc", "size": "142" },
                      { "name": "tObjectControlWidget.h", "color": "#bcbddc", "size": "49" },
                      { "name": "tObjectPropertiesDialog.h", "color": "#bcbddc", "size": "49" },
                      { "name": "tSimVis3DSoQtExaminerViewer.cpp", "color": "#bcbddc", "size": "55" },
                      { "name": "tSimVis3DSoQtExaminerViewer.h", "color": "#bcbddc", "size": "36" },
                      { "name": "tStringBBOverlayPlugin.cpp", "color": "#bcbddc", "size": "266" },
                      { "name": "tStringBBOverlayPlugin.h", "color": "#bcbddc", "size": "149" },
                      { "name": "vrmIlTo2Converter.cpp", "color": "#bcbddc", "size": "120" },
                      { "name": "vrml2To1Converter.cpp", "color": "#bcbddc", "size": "120" },
                      {
                          "name": "wrapper", "color": "#bcbddc",
                          "children": [
                             { "name": "tBoundingBoxBBWrapper.cpp", "color": "#dadaeb", "size": "219" },
                             { "name": "tBoundingBoxBBWrapper.h", "color": "#dadaeb", "size": "125" },
                             { "name": "tDenavitHartenbergBBWrapper.cpp", "color": "#dadaeb", "size": "109" },
                             { "name": "tDenavitHartenbergBBWrapper.h", "color": "#dadaeb", "size": "100" },
                             { "name": "tDirectionMarkerBBWrapper.cpp", "color": "#dadaeb", "size": "183" },
                             { "name": "tDirectionMarkerBBWrapper.h", "color": "#dadaeb", "size": "120" },
                             { "name": "tEIevationGridBBWrapper.cpp", "color": "#dadaeb", "size": "410" },
                             { "name": "tElevationGridBBWrapper.h", "color": "#dadaeb", "size": "163" },
                             { "name": "tFaceSetBBWrapper.cpp", "color": "#dadaeb", "size": "423" },
                             { "name": "tFaceSetBBWrapper.h", "color": "#dadaeb", "size": "160" },
                             { "name": "tHAnimBBWrapper.cpp", "color": "#dadaeb", "size": "277" },
                             { "name": "tHAnimBBWrapper.h", "color": "#dadaeb", "size": "146" },
                             { "name": "tHumanBBWrapper.cpp", "color": "#dadaeb", "size": "109" },
                             { "name": "tHumanBBWrapper.h", "color": "#dadaeb", "size": "112" },
                             { "name": "tLineSetBBWrapper.cpp", "color": "#dadaeb", "size": "305" },
                             { "name": "tLineSetBBWrapper.h", "color": "#dadaeb", "size": "140" },
                             { "name": "tManikinBBWrapper.cpp", "color": "#dadaeb", "size": "289" },
                             { "name": "tManikinBBWrapper.h", "color": "#dadaeb", "size": "129" },
                             { "name": "tMarvinBBWrapper.cpp", "color": "#dadaeb", "size": "140" },
                             { "name": "tMarvinBBWrapper.h", "color": "#dadaeb", "size": "126" },
                             { "name": "tMatrixBBWrapper.cpp", "color": "#dadaeb", "size": "99" },
                             { "name": "tMatrixBBWrapper.h", "color": "#dadaeb", "size": "104" },
                             { "name": "tMuItiplePlaneBBWrapper.cpp", "color": "#dadaeb", "size": "122" },
                             { "name": "tMuItiplePlaneBBWrapper.h", "color": "#dadaeb", "size": "105" },
                             { "name": "tMuItiplePoseBBWrapper.h", "color": "#dadaeb", "size": "148" },
                             { "name": "tMuItipleRotationBBWrapper.cpp", "color": "#dadaeb", "size": "119" },
                             { "name": "tMuItipleRotationBBWrapper.h", "color": "#dadaeb", "size": "114" },
                             { "name": "tMultiplePoseBBWrapper.cpp", "color": "#dadaeb", "size": "162" },
                             { "name": "tObjectBBWrapper.cpp", "color": "#dadaeb", "size": "480" },
                             { "name": "tObjectBBWrapper.h", "color": "#dadaeb", "size": "245" },
                             { "name": "tPlaneBBWrapper.cpp", "color": "#dadaeb", "size": "124" },
                             { "name": "tPlaneBBWrapper.h", "color": "#dadaeb", "size": "109" },
                             { "name": "tPointSetBBWrapper.cpp", "color": "#dadaeb", "size": "221" },
                             { "name": "tPointSetBBWrapper.h", "color": "#dadaeb", "size": "123" },
                             { "name": "tPoseBBWrapper.cpp", "color": "#dadaeb", "size": "131" },
                             { "name": "tPoseBBWrapper.h", "color": "#dadaeb", "size": "123" },
                             { "name": "tPoseIndicatorBBWrapper.cpp", "color": "#dadaeb", "size": "127" },
                             { "name": "tPoseIndicatorBBWrapper.h", "color": "#dadaeb", "size": "112" },
                             { "name": "tPositionMarkerBBWrapper.cpp", "color": "#dadaeb", "size": "178" },
                             { "name": "tPositionMarkerBBWrapper.h", "color": "#dadaeb", "size": "130" },
                             { "name": "tRotationBBWrapper.cpp", "color": "#dadaeb", "size": "95" },
                             { "name": "tRotationBBWrapper.h", "color": "#dadaeb", "size": "103" },
                             { "name": "tSecletMapBBWrapper.cpp", "color": "#dadaeb", "size": "232" },
                             { "name": "tSecletMapBBWrapper.h", "color": "#dadaeb", "size": "144" },
                             { "name": "tSwitchBBWrapper.cpp", "color": "#dadaeb", "size": "116" },
                             { "name": "tSwitchBBWrapper.h", "color": "#dadaeb", "size": "111" },
                             { "name": "tTexturedFaceBBWrapper.cpp", "color": "#dadaeb", "size": "173" },
                             { "name": "tTexturedFaceBBWrapper.h", "color": "#dadaeb", "size": "131" },
                             { "name": "tVoxelMapBBWrapper.cpp", "color": "#dadaeb", "size": "199" },
                             { "name": "tVoxelMapBBWrapper.h", "color": "#dadaeb", "size": "128" }
                          ]
                      }
                   ]
               },
               {
                   "name": "navigation", "color": "#9e9ac8",
                   "children": [
                      { "name": "GraphDefinition.h", "color": "#bcbddc", "size": "116" },
                      { "name": "ImportExportSymboIs.h", "color": "#bcbddc", "size": "67" },
                      { "name": "mGraphModule.cpp", "color": "#bcbddc", "size": "587" },
                      { "name": "mGraphModule.h", "color": "#bcbddc", "size": "283" },
                      { "name": "tDraw2DWorId.cpp", "color": "#bcbddc", "size": "951" },
                      { "name": "tDraw2DWorId.h", "color": "#bcbddc", "size": "211" },
                      { "name": "tDraw2DWorIdMultiBot.cpp", "color": "#bcbddc", "size": "816" },
                      { "name": "tDraw2DWorIdMultiBot.h", "color": "#bcbddc", "size": "171" },
                      { "name": "tGraphColorizer.cpp", "color": "#bcbddc", "size": "46" },
                      { "name": "tGraphColorizer.h", "color": "#bcbddc", "size": "63" },
                      { "name": "tGraphEdit.cpp", "color": "#bcbddc", "size": "120" },
                      { "name": "tGraphEdit.h", "color": "#bcbddc", "size": "134" },
                      { "name": "tGraphEditAttribute.cpp", "color": "#bcbddc", "size": "70" },
                      { "name": "tGraphEditAttribute.h", "color": "#bcbddc", "size": "100" },
                      { "name": "tGraphEditEdge.cpp", "color": "#bcbddc", "size": "60" },
                      { "name": "tGraphEditEdge.h", "color": "#bcbddc", "size": "86" },
                      { "name": "tGraphEditNode.cpp", "color": "#bcbddc", "size": "48" },
                      { "name": "tGraphEditNode.h", "color": "#bcbddc", "size": "115" },
                      { "name": "tNodeType.h", "color": "#bcbddc", "size": "75" },
                      { "name": "tQDraw2DWorld.cpp", "color": "#bcbddc", "size": "931" },
                      { "name": "tQDraw2DWorld.h", "color": "#bcbddc", "size": "342" },
                      { "name": "tQDraw2DWorldMultiBot.cpp", "color": "#bcbddc", "size": "869" },
                      { "name": "tQDraw2DWorldMultiBot.h", "color": "#bcbddc", "size": "376" },
                      { "name": "tQNodeList.cpp", "color": "#bcbddc", "size": "68" },
                      { "name": "tQNodeList.h", "color": "#bcbddc", "size": "36" },
                      { "name": "tQTypeListViewItem.cpp", "color": "#bcbddc", "size": "34" },
                      { "name": "tQTypeListViewItem.h", "color": "#bcbddc", "size": "46" },
                      { "name": "tQWorIdGraphNode.h", "color": "#bcbddc", "size": "44" },
                      { "name": "tQWorIdMapEdge.h", "color": "#bcbddc", "size": "59" },
                      { "name": "tQWorldGraph.cpp", "color": "#bcbddc", "size": "955" },
                      { "name": "tQWorldGraph.h", "color": "#bcbddc", "size": "190" },
                      { "name": "tQWorldGraphEdge.cpp", "color": "#bcbddc", "size": "78" },
                      { "name": "tQWorldGraphEdge.h", "color": "#bcbddc", "size": "52" },
                      { "name": "tQWorldGraphNode.cpp", "color": "#bcbddc", "size": "74" },
                      { "name": "tQWorldMap.cpp", "color": "#bcbddc", "size": "175" },
                      { "name": "tQWorldMap.h", "color": "#bcbddc", "size": "121" },
                      { "name": "tQWorldMapEdge.cpp", "color": "#bcbddc", "size": "44" },
                      { "name": "tQWorldMapObject.cpp", "color": "#bcbddc", "size": "73" },
                      { "name": "tQWorldMapObject.h", "color": "#bcbddc", "size": "64" },
                      { "name": "tQWorldMapPolygon.cpp", "color": "#bcbddc", "size": "75" },
                      { "name": "tQWorldMapPolygon.h", "color": "#bcbddc", "size": "64" },
                      { "name": "tUseMask.h", "color": "#bcbddc", "size": "57" },
                      { "name": "tWorldGraph.cpp", "color": "#bcbddc", "size": "377" },
                      { "name": "tWorldGraph.h", "color": "#bcbddc", "size": "301" },
                      { "name": "tWorldGraphEdge.cpp", "color": "#bcbddc", "size": "64" },
                      { "name": "tWorldGraphEdge.h", "color": "#bcbddc", "size": "191" },
                      { "name": "tWorldGraphNode.cpp", "color": "#bcbddc", "size": "67" },
                      { "name": "tWorldGraphNode.h", "color": "#bcbddc", "size": "223" },
                      { "name": "tWorldGraphPath.cpp", "color": "#bcbddc", "size": "161" },
                      { "name": "tWorldGraphPath.h", "color": "#bcbddc", "size": "150" },
                      { "name": "tWorldGraphPathLeaf.cpp", "color": "#bcbddc", "size": "93" },
                      { "name": "tWorldGraphPathLeaf.h", "color": "#bcbddc", "size": "181" },
                      { "name": "tWorldMap.cpp", "color": "#bcbddc", "size": "200" },
                      { "name": "tWorldMap.h", "color": "#bcbddc", "size": "280" },
                      { "name": "tWorldMapEdge.cpp", "color": "#bcbddc", "size": "160" },
                      { "name": "tWorldMapEdge.h", "color": "#bcbddc", "size": "204" },
                      { "name": "tWorldMapObject.cpp", "color": "#bcbddc", "size": "139" },
                      { "name": "tWorldMapObject.h", "color": "#bcbddc", "size": "268" },
                      { "name": "tWorldMapPolygon.cpp", "color": "#bcbddc", "size": "136" },
                      { "name": "tWorldMapPolygon.h", "color": "#bcbddc", "size": "107" },
                      { "name": "tWorldReader.cpp", "color": "#bcbddc", "size": "448" },
                      { "name": "tWorldReader.h", "color": "#bcbddc", "size": "394" },
                      { "name": "tWorldReaderException.h", "color": "#bcbddc", "size": "47" },
                      { "name": "tWorldReaderGet.h", "color": "#bcbddc", "size": "182" }
                   ]
               },
               {
                   "name": "stereo_vision", "color": "#9e9ac8",
                   "children": [
                      { "name": "gStereoFrameGrabberDC1394.cpp", "color": "#bcbddc", "size": "70" },
                      { "name": "gStereoFrameGrabberDC1394.h", "color": "#bcbddc", "size": "128" },
                      { "name": "gStereoVisionSystem.cpp", "color": "#bcbddc", "size": "306" },
                      { "name": "gStereoVisionSystem.h", "color": "#bcbddc", "size": "261" },
                      { "name": "m3DReconstruction.cpp", "color": "#bcbddc", "size": "547" },
                      { "name": "m3DReconstruction.h", "color": "#bcbddc", "size": "236" },
                      { "name": "mCameraSynchronization.cpp", "color": "#bcbddc", "size": "149" },
                      { "name": "mCameraSynchronization.h", "color": "#bcbddc", "size": "174" },
                      { "name": "mDisparityMapGenerator.cpp", "color": "#bcbddc", "size": "787" },
                      { "name": "mDisparityMapGenerator.h", "color": "#bcbddc", "size": "377" },
                      { "name": "pStereoVisionSystem.cpp", "color": "#bcbddc", "size": "182" },
                      { "name": "pTestStereoFrameGrabberDC1394.cpp", "color": "#bcbddc", "size": "42" },
                      { "name": "sDisparityMapGenerationStrategyFactory.cpp", "color": "#bcbddc", "size": "49" },
                      { "name": "sStereovisionUtils.h", "color": "#bcbddc", "size": "63" },
                      { "name": "t2DReconstruction.cpp", "color": "#bcbddc", "size": "90" },
                      { "name": "t2DReconstruction.h", "color": "#bcbddc", "size": "133" },
                      { "name": "t3DReconstruction.cpp", "color": "#bcbddc", "size": "51" },
                      { "name": "t3DReconstruction.h", "color": "#bcbddc", "size": "327" },
                      { "name": "tDisparityMapGenerationStrategy.h", "color": "#bcbddc", "size": "109" },
                      { "name": "tMSoftDispMapGenStrat.cpp", "color": "#bcbddc", "size": "72" },
                      { "name": "tMSoftDispMapGenStrat.h", "color": "#bcbddc", "size": "63" },
                      { "name": "tOpenCVDispMapGenStrat.cpp", "color": "#bcbddc", "size": "191" },
                      { "name": "tOpenCVDispMapGenStrat.h", "color": "#bcbddc", "size": "81" },
                      { "name": "tWindowBasedDispMapGenStrat.cpp", "color": "#bcbddc", "size": "106" },
                      { "name": "tWindowBasedDispMapGenStrat.h", "color": "#bcbddc", "size": "97" },
                      { "name": "tWindowBasedDispMapGenStratLRS.cpp", "color": "#bcbddc", "size": "148" },
                      { "name": "tWindowBasedDispMapGenStratLRS.h", "color": "#bcbddc", "size": "39" },
                  { "name": "gStereoFrameGrabberDC1394.cpp", "color": "#bcbddc", "size": "70" },
                      { "name": "gStereoFrameGrabberDC1394.h", "color": "#bcbddc", "size": "128" },
                      { "name": "gStereoVisionSystem.cpp", "color": "#bcbddc", "size": "306" },
                      { "name": "gStereoVisionSystem.h", "color": "#bcbddc", "size": "261" },
                      { "name": "m3DReconstruction.cpp", "color": "#bcbddc", "size": "547" },
                      { "name": "m3DReconstruction.h", "color": "#bcbddc", "size": "236" },
                      { "name": "mCameraSynchronization.cpp", "color": "#bcbddc", "size": "149" },
                      { "name": "mCameraSynchronization.h", "color": "#bcbddc", "size": "174" },
                      { "name": "mDisparityMapGenerator.cpp", "color": "#bcbddc", "size": "787" },
                      { "name": "mDisparityMapGenerator.h", "color": "#bcbddc", "size": "377" },
                      { "name": "pStereoVisionSystem.cpp", "color": "#bcbddc", "size": "182" },
                      { "name": "pTestStereoFrameGrabberDC1394.cpp", "color": "#bcbddc", "size": "42" },
                      { "name": "sDisparityMapGenerationStrategyFactory.cpp", "color": "#bcbddc", "size": "49" },
                      { "name": "sStereovisionUtils.h", "color": "#bcbddc", "size": "63" },
                      { "name": "t2DReconstruction.cpp", "color": "#bcbddc", "size": "90" },
                      { "name": "t2DReconstruction.h", "color": "#bcbddc", "size": "133" },
                      { "name": "t3DReconstruction.cpp", "color": "#bcbddc", "size": "51" },
                      { "name": "t3DReconstruction.h", "color": "#bcbddc", "size": "327" },
                      { "name": "tDisparityMapGenerationStrategy.h", "color": "#bcbddc", "size": "109" },
                      { "name": "tMSoftDispMapGenStrat.cpp", "color": "#bcbddc", "size": "72" },
                      { "name": "tMSoftDispMapGenStrat.h", "color": "#bcbddc", "size": "63" },
                      { "name": "tOpenCVDispMapGenStrat.cpp", "color": "#bcbddc", "size": "191" },
                      { "name": "tOpenCVDispMapGenStrat.h", "color": "#bcbddc", "size": "81" },
                      { "name": "tWindowBasedDispMapGenStrat.cpp", "color": "#bcbddc", "size": "106" },
                      { "name": "tWindowBasedDispMapGenStrat.h", "color": "#bcbddc", "size": "97" },
                      { "name": "tWindowBasedDispMapGenStratLRS.cpp", "color": "#bcbddc", "size": "148" },
                      { "name": "tWindowBasedDispMapGenStratLRS.h", "color": "#bcbddc", "size": "39" },
                      {
                          "name": "dm_strat_birchfield", "color": "#bcbddc",
                          "children": [
                             { "name": "postprocess.h", "color": "#dadaeb", "size": "84" },
                             { "name": "match_scanlines.h", "color": "#dadaeb", "size": "236" },
                             { "name": "p2p.h", "color": "#dadaeb", "size": "48" },
                             { "name": "pnmio.h", "color": "#dadaeb", "size": "83" },
                             { "name": "TestPP.cpp", "color": "#dadaeb", "size": "44" },
                             { "name": "tPostProcessor.cpp", "color": "#dadaeb", "size": "1037" },
                             { "name": "tPostProcessor.h", "color": "#dadaeb", "size": "93" },
                             { "name": "tPostProcessorOpenCV.cpp", "color": "#dadaeb", "size": "917" },
                             { "name": "tPostProcessorOpenCV.h", "color": "#dadaeb", "size": "101" },
                             { "name": "tScanlineMatcher.cpp", "color": "#dadaeb", "size": "536" },
                             { "name": "tScanlineMatcher.h", "color": "#dadaeb", "size": "136" },
                             { "name": "tToBiPostProcessor.cpp", "color": "#dadaeb", "size": "1085" },
                             { "name": "tToBiPostProcessor.h", "color": "#dadaeb", "size": "266" }
                          ]
                      }
                   ]
               }
            ]
        }

        ]
    };
};