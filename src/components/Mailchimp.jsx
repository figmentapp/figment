import React from "react";

export default function Mailchimp() {
  return (
    <div id="mc_embed_signup">
      <form
        action="https://kdg.us11.list-manage.com/subscribe/post?u=f2f4dfed688882b52d74c63fb&amp;id=811d41b0b2&amp;f_id=0064e6e0f0"
        method="post"
        id="mc-embedded-subscribe-form"
        name="mc-embedded-subscribe-form"
        className="validate"
        target="_self"
        noValidate
      >
        <div id="mc_embed_signup_scroll">
          <h1>Join Our Newsletter</h1>
          <p className="mc-tagline">Stay up to date with the latest developments of Figment.</p>
          <div className="mc-field-group">
            <label className="sr-only" htmlFor="mce-EMAIL">
              Email Address
            </label>
            <input
              type="email"
              name="EMAIL"
              className="required email"
              id="mce-EMAIL"
              placeholder="hello@example.com"
              required
            />
          </div>
          <div className="clear">
            <input
              type="submit"
              name="subscribe"
              id="mc-embedded-subscribe"
              className="button"
              value="Subscribe"
            />
          </div>
          <div id="mce-responses" className="clear">
            <div className="response" id="mce-error-response" style={{ display: "none" }}></div>
            <div className="response" id="mce-success-response" style={{ display: "none" }}></div>
          </div>
          <div style={{ position: "absolute", left: "-5000px" }} aria-hidden="true">
            <input
              type="text"
              name="b_f2f4dfed688882b52d74c63fb_811d41b0b2"
              tabIndex={-1}
              defaultValue=""
            />
          </div>
        </div>
      </form>
    </div>
  );
}
