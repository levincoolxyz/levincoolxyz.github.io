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
	}else if(placenow == 'movrev' || placenow == 'fotos') {
		$('#posttab').toggleClass('active');
	}else {
		$('#hometab').toggleClass('active');
	}

	$("[rel='tooltip']").tooltip();    

	$('.thumbnail').mouseenter(
		function(){
				$(this).find('.caption').slideDown(250); //.fadeIn(250)
		}
	);

	$('.thumbnail').mouseleave(
		function(){
			$(this).find('.caption').slideUp(250); //.fadeOut(205)
		}
	);

	$('.thumbnail').on("click tap",
	    function(){
	        $(this).find('.caption').show();
	        $(this).find('.caption').toggleClass("down");
	    },
	    function(){
			$(this).find('.caption.down').hide();
		}
	);
}

$(document).ready(activatetab);