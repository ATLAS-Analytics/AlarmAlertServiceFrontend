; (function () {
  'use strict';

  let dropdown = function () {
    $('.has-dropdown').mouseenter(function () {
      let $this = $(this);
      $this
        .find('.dropdown')
        .css('display', 'block')
        .addClass('animated-fast fadeInUpMenu');
    }).mouseleave(function () {
      let $this = $(this);

      $this
        .find('.dropdown')
        .css('display', 'none')
        .removeClass('animated-fast fadeInUpMenu');
    });
  };

  let tabs = function () {
    // Auto adjust height
    $('.gtco-tab-content-wrap').css('height', 0);
    let autoHeight = function () {
      setTimeout(function () {
        let tabContentWrap = $('.gtco-tab-content-wrap'),
          tabHeight = $('.gtco-tab-nav').outerHeight(),
          formActiveHeight = $('.tab-content.active').outerHeight(),
          totalHeight = parseInt(tabHeight + formActiveHeight + 90);

        tabContentWrap.css('height', totalHeight);

        $(window).resize(function () {
          let tabContentWrap = $('.gtco-tab-content-wrap'),
            tabHeight = $('.gtco-tab-nav').outerHeight(),
            formActiveHeight = $('.tab-content.active').outerHeight(),
            totalHeight = parseInt(tabHeight + formActiveHeight + 90);

          tabContentWrap.css('height', totalHeight);
        });
      }, 100);
    };

    autoHeight();


    // Click tab menu
    $('.gtco-tab-nav a').on('click', function (event) {
      let $this = $(this);
      let tab = $this.data('tab');

      $('.tab-content')
        .addClass('animated-fast fadeOutDown');

      $('.tab-content')
        .removeClass('active');

      $('.gtco-tab-nav li').removeClass('active');

      $this
        .closest('li')
        .addClass('active');

      $this
        .closest('.gtco-tabs')
        .find('.tab-content[data-tab-content="' + tab + '"]')
        .removeClass('animated-fast fadeOutDown')
        .addClass('animated-fast active fadeIn');

      autoHeight();
      event.preventDefault();
    });
  };

  let loaderPage = function () {
    $('.gtco-loader').fadeOut('slow');
  };

  $('#private_jupyter_create_button').click((event) => {
    event.preventDefault();
    console.log('Private jupyter creator called.');

    $('#name_valid').text('').show();
    $('#pass_valid').text('').show();

    const data = {};
    if ($('#name').val() === '') {
      $('#name_valid').text('Name is mandatory!').show();
      return;
    }
    else {
      var inp = $('#name').val();
      inp = inp.toLowerCase();
      inp = inp.replace(' ', '-');
      inp = inp.replace('.', '-');
      inp = inp.replace(':', '-');
      inp = inp.replace('_', '-');
      $('#name').val(inp);
    }
    if ($('#password').val() === '') {
      $('#pass_valid').text('Password is mandatory!').show();
      return;
    }

    data['name'] = inp;
    data['password'] = $('#password').val();
    data['time'] = $('#allocation').val();
    data['gpus'] = $('#gpus').val();
    data['cpus'] = $('#cpus').val();
    data['memory'] = $('#memory').val();
    data['repository'] = $('#customgit').val();
    data['image'] = $('#imageselection').val();
    console.log(data);
    // call REST API to create a Private Jupyter Instance
    let jqxhr = $.ajax({
      type: 'post',
      url: '/jupyter',
      contentType: 'application/json',
      data: JSON.stringify(data),
      success: function (link) {
        alert('It can take several minutes after service status changes to "running" for the service to become available.');
        window.location.href = '/private_jupyter_lab_manage';
      },
      error: function (xhr, textStatus, errorThrown) {
        alert('Error code:' + xhr.status + '.  ' + xhr.responseText);
        window.location.href = '/private_jupyter_lab_manage';
      }
    });
  });

  $('#logout_button').click(() => {
    $.get('/logout');
    window.location.replace('/');
  });


  $(() => {
    dropdown();
    tabs();
    loaderPage();
  });
}());