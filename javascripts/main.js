/*
var main = function() {
  $('.dropdown-toggle').click(function() {
    $('.dropdown-menu').toggle();
  });
}

$(document).ready(main);

*/

/*
placenow = document.URL.split(/[\\/]/)[3];
if(placenow == 'cv') {
	document.getElementById("cvtab").className += "active";
}else if(placenow == 'movrev') {
	document.getElementById("posttab").className += "active";
}else {
	document.getElementById("hometab").className += "active";
}
*/

var activatetab = function() {
	placenow = document.URL.split(/[\\/]/)[3];
	if(placenow == 'cv') {
		$('#cvtab').toggleClass('active');
	}else if(placenow == 'movrev') {
		$('#posttab').toggleClass('active');
	}else {
		$('#hometab').toggleClass('active');
	}
}

$(document).ready(activatetab);