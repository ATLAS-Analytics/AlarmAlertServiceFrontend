export default function Footer() {
  return (
    <>
      <hr />
      <footer className="py-4 bg-light">
        <div className="container">
          <small>
            © {new Date().getFullYear()} University of Chicago. This platform is supported by the Enrico Fermi Institute at the University of Chicago.
          </small>
        </div>
      </footer>
    </>
  );
}
